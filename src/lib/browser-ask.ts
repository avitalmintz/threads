// Browser-side semantic Q&A. Mirrors `/api/ask`'s tool-use loop, but every
// tool call runs locally against the in-browser chat.db (browser-db) — only
// LLM round-trips go through the network (via /api/llm). This way the model
// can reach into the FULL archive on demand without ever uploading it.
//
// Two modes:
//   - Archive scope (default): stats for ALL contacts in the system prompt,
//     three tools to read content as needed.
//   - Contact scope ({ contactId, displayName }): the entire conversation
//     with that one person is in the prompt; no tools.

import {
  callClaude,
  extractText,
  type Message,
  type Tool,
} from "./browser-llm";
import {
  findContactsByQuery,
  getHandleDetail,
  getHandleSummaries,
  rankContactsInRange,
  searchMessages,
  type HandleSummary,
  type RankedContact,
  type SearchHit,
} from "./browser-db";

const SYSTEM_PROMPT = `You are an assistant analyzing the user's iMessage history. Use the tools provided to actually read enough message content to answer their questions properly.

You have:
1. STATS ONLY in your context — per-contact aggregate stats (total messages, sender split, date range, recent activity windows). NO message content samples. The stats give you orientation; the tools give you the actual content.
2. THREE tools:
   - 'search_messages': search the FULL archive by keywords, optionally filtered by contact and/or date range. Returns up to 200 matches.
   - 'rank_contacts_in_range': rank contacts by volume within a date window.
   - 'get_contact_summary': load stats + actual message content for ONE specific contact. messageLimit defaults 50, max 500. USE HIGH LIMITS (200-500) for any semantic / pattern / texture question about a relationship.

Today's date: ${new Date().toISOString().slice(0, 10)}.

CRITICAL RULES:
- For volume / ranking / count questions → use stats already in context (no tools needed).
- For ANY content / sentiment / pattern / theme / texture question → YOU MUST USE TOOLS to load real message content. Never answer based on guesses.
- Question about a specific person ("what does sarah talk to me about", "are joey and i drifting") → call get_contact_summary with messageLimit at LEAST 200, ideally 400. Read enough to actually see patterns.
- Question about cross-contact patterns ("who do i fight with most", "who compliments me") → call search_messages with 8-15 keywords and limit 200.
- Time-windowed ranking → rank_contacts_in_range.

Search keywords reference:
- Fights: ["sorry", "fuck", "mad", "angry", "stop", "rude", "leave me alone", "asshole", "wtf", "fucking", "annoying", "ugh"]
- Compliments: ["love you", "amazing", "beautiful", "proud of you", "you're so", "the best", "gorgeous", "cute", "smart", "miss you", "incredible"]
- Drift signals: ["been a while", "haven't talked", "miss you", "should catch up", "we should hang"]

After you have data, ANSWER. Group by sender, cite specific dates, quote real phrases. 3-6 sentences. Plain language. Never invent.`;

const TOOLS: Tool[] = [
  {
    name: "search_messages",
    description:
      "Search the user's full message archive for messages containing any of the given keywords (case-insensitive). Returns up to `limit` most-recent matches with date, sender, and text. Use for content/sentiment questions. Optionally filter by contact and/or date range.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description:
            "Words or short phrases to search for. Multiple keywords are OR'd together (any match). Be generous with synonyms.",
        },
        contactFilter: {
          type: "string",
          description:
            "Optional: limit to a specific contact by phone/email/name fragment.",
        },
        startDate: {
          type: "string",
          description: "Optional ISO date (YYYY-MM-DD). Only messages on or after this date.",
        },
        endDate: {
          type: "string",
          description: "Optional ISO date (YYYY-MM-DD). Only messages on or before this date (inclusive).",
        },
        limit: {
          type: "number",
          description: "Max results (default 50, max 200).",
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "get_contact_summary",
    description:
      "Look up a specific contact by name or phone/email fragment, returning their stats + actual message content. Use this for ANY question that involves analyzing the texture / patterns / sentiment / themes of a relationship with one specific person. Pass a high messageLimit (200-500) when you need to actually read enough to answer semantic questions; the default 50 is only enough for 'what was our last conversation' style questions.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name or identifier fragment (e.g. 'joey', 'mom', '+15551234567').",
        },
        messageLimit: {
          type: "number",
          description:
            "How many of their most-recent messages to return. Default 50, max 500. Use 200-500 for semantic / pattern analysis; 50 for 'what's our latest message'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "rank_contacts_in_range",
    description:
      "Rank the user's contacts by total message volume within a specific date range. Same accurate attribution as the all-time stats (1:1 chats fully counted, group chat messages only counted for the actual sender).",
    input_schema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "ISO date (YYYY-MM-DD). Start of window." },
        endDate: { type: "string", description: "ISO date (YYYY-MM-DD). End of window (inclusive)." },
        limit: { type: "number", description: "Top N contacts (default 20, max 50)." },
      },
      required: ["startDate", "endDate"],
    },
  },
];

const MAX_TURNS = 8;

export type AskResult = { answer: string; turnsUsed: number };

export async function askArchive(question: string): Promise<AskResult> {
  const context = buildArchiveContext();
  return runLoop(SYSTEM_PROMPT, context, question);
}

export async function askContact(
  contactId: number,
  question: string,
): Promise<AskResult> {
  const scoped = buildScopedContext(contactId);
  if (!scoped) throw new Error("contact not found");
  return runLoopNoTools(scoped.system, scoped.context, question);
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop: archive scope, with tools.
// ─────────────────────────────────────────────────────────────────────────────

async function runLoop(
  system: string,
  context: string,
  question: string,
): Promise<AskResult> {
  const messages: Message[] = [
    {
      role: "user",
      content: `Here is the data about my iMessage history:\n\n${context}\n\nMy question: ${question}`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callClaude({
      system,
      messages,
      tools: TOOLS,
      maxTokens: 1500,
    });

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults = response.content
        .filter(
          (c): c is {
            type: "tool_use";
            id: string;
            name: string;
            input: Record<string, unknown>;
          } => c.type === "tool_use",
        )
        .map((call) => ({
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: executeTool(call.name, call.input),
        }));

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    return { answer: extractText(response), turnsUsed: turn };
  }

  return {
    answer: "tool-use loop hit the safety cap. try rephrasing your question.",
    turnsUsed: MAX_TURNS,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop: contact scope, no tools (single-shot — context already has the convo).
// ─────────────────────────────────────────────────────────────────────────────

async function runLoopNoTools(
  system: string,
  context: string,
  question: string,
): Promise<AskResult> {
  const response = await callClaude({
    system,
    messages: [
      {
        role: "user",
        content: `${context}\n\nQuestion: ${question}`,
      },
    ],
    maxTokens: 1500,
  });
  return { answer: extractText(response), turnsUsed: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool dispatch.
// ─────────────────────────────────────────────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>): string {
  if (name === "search_messages") {
    const keywords = Array.isArray(input.keywords)
      ? (input.keywords as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
    const contactFilter =
      typeof input.contactFilter === "string" ? input.contactFilter : undefined;
    const startDate = typeof input.startDate === "string" ? input.startDate : undefined;
    const endDate = typeof input.endDate === "string" ? input.endDate : undefined;
    const limit = typeof input.limit === "number" ? input.limit : 50;

    if (keywords.length === 0) {
      return JSON.stringify({ error: "no keywords provided", hits: [] });
    }
    const hits = searchMessages(keywords, { contactFilter, startDate, endDate, limit });
    return formatSearchHits(hits, keywords);
  }

  if (name === "rank_contacts_in_range") {
    const startDate = typeof input.startDate === "string" ? input.startDate : "";
    const endDate = typeof input.endDate === "string" ? input.endDate : "";
    const limit = typeof input.limit === "number" ? input.limit : 20;
    if (!startDate || !endDate) {
      return JSON.stringify({ error: "both startDate and endDate are required" });
    }
    const ranked = rankContactsInRange(startDate, endDate, limit);
    return formatRankedContacts(ranked, startDate, endDate);
  }

  if (name === "get_contact_summary") {
    const query = typeof input.query === "string" ? input.query : "";
    const messageLimit =
      typeof input.messageLimit === "number"
        ? Math.max(10, Math.min(500, input.messageLimit))
        : 50;
    if (!query) return JSON.stringify({ error: "query is required" });
    const matches = findContactsByQuery(query, 5);
    return formatContactSummaries(matches, messageLimit);
  }

  return JSON.stringify({ error: `unknown tool: ${name}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool result formatters.
// ─────────────────────────────────────────────────────────────────────────────

function formatContactSummaries(
  matches: HandleSummary[],
  messageLimit: number,
): string {
  if (matches.length === 0) {
    return "No contacts matched. Try a different name or phone/email fragment.";
  }
  const lines: string[] = [];
  lines.push(`Found ${matches.length} contact match(es):`);
  lines.push("");

  for (const s of matches) {
    const lastStr = formatLastSeen(s.latest);
    lines.push(`${s.displayName} (${s.handle.identifier})`);
    lines.push(
      `  total: ${s.totalMessages} | from me: ${s.messagesFromMe} | from them: ${s.messagesFromThem}`,
    );
    lines.push(
      `  last message: ${lastStr} | recent: ${s.recent30}/30d, ${s.recent90}/90d, ${s.recent365}/365d`,
    );
    if (s.earliest && s.latest) {
      lines.push(
        `  range: ${s.earliest.toISOString().slice(0, 10)} → ${s.latest.toISOString().slice(0, 10)}`,
      );
    }

    const mode = messageLimit > 100 ? "auto" : "recent";
    // 1:1 only — get_contact_summary is for "what does X talk to me about"
    // style questions; group-chat messages from this contact aren't
    // addressed to the user. (search_messages is the tool to use when the
    // model wants the full archive.)
    const detail = getHandleDetail(s.handle.id, messageLimit, mode, true);
    if (detail && detail.recentMessages.length > 0) {
      const label =
        mode === "auto"
          ? `messages ${detail.recentMessages.length >= s.totalMessages ? "(full conversation)" : "stratified across full history"}`
          : "most recent messages (chronological)";
      lines.push(`  ${detail.recentMessages.length} ${label}:`);
      for (const m of detail.recentMessages) {
        const who = m.isFromMe ? "ME" : s.displayName;
        const txt = m.text.length > 200 ? m.text.slice(0, 200) + "…" : m.text;
        const dateStr = m.date.toISOString().slice(0, 10);
        lines.push(`    [${dateStr}] [${who}] ${txt.replace(/\n/g, " ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatRankedContacts(
  ranked: RankedContact[],
  startDate: string,
  endDate: string,
): string {
  if (ranked.length === 0) {
    return `No messages found between ${startDate} and ${endDate}.`;
  }
  const lines: string[] = [];
  lines.push(
    `Top ${ranked.length} contacts by message volume from ${startDate} to ${endDate}:`,
  );
  for (const [i, r] of ranked.entries()) {
    lines.push(
      `  ${i + 1}. ${r.displayName} (${r.identifier}) — ${r.totalMessages} total | from me: ${r.messagesFromMe} | from them: ${r.messagesFromThem}`,
    );
  }
  return lines.join("\n");
}

function formatSearchHits(hits: SearchHit[], keywords: string[]): string {
  if (hits.length === 0) {
    return `No messages found matching ${JSON.stringify(keywords)}. Try different / broader keywords.`;
  }
  const lines: string[] = [];
  lines.push(`Found ${hits.length} matches across the archive (most recent first):`);
  for (const h of hits) {
    const dateStr = h.date.toISOString().slice(0, 10);
    const who = h.isFromMe ? "ME" : (h.contactName ?? h.identifier);
    const txt = h.text.length > 250 ? h.text.slice(0, 250) + "…" : h.text;
    lines.push(`  [${dateStr}] [${who}] ${txt.replace(/\n/g, " ")}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Context builders.
// ─────────────────────────────────────────────────────────────────────────────

function buildArchiveContext(): string {
  const summaries = getHandleSummaries();
  const all = summaries.filter((s) => s.totalMessages >= 5);

  const lines: string[] = [];
  lines.push(
    `Total contacts in archive: ${summaries.length} (${all.length} with 5+ messages). Listed below: stats only. To read message CONTENT for any contact, call get_contact_summary or search_messages.`,
  );
  lines.push("");
  lines.push("=== ALL CONTACTS (stats only) ===");
  lines.push("");

  for (const [i, s] of all.entries()) {
    const lastStr = formatLastSeen(s.latest);
    const range =
      s.earliest && s.latest
        ? `${s.earliest.toISOString().slice(0, 10)} → ${s.latest.toISOString().slice(0, 10)}`
        : "?";
    lines.push(
      `[${i + 1}] ${s.displayName} (${s.handle.identifier}) — ${s.totalMessages} total | me: ${s.messagesFromMe} | them: ${s.messagesFromThem} | last: ${lastStr} | recent: ${s.recent30}/30d ${s.recent90}/90d ${s.recent365}/365d | range: ${range}`,
    );
  }

  return lines.join("\n");
}

function buildScopedContext(handleId: number): { context: string; system: string } | null {
  // 1:1 only — the scoped ask box is "ask about your conversation with X",
  // which means the private convo, not group chats they're both in.
  const detail = getHandleDetail(handleId, 3000, "auto", true);
  if (!detail) return null;

  const lines: string[] = [];
  lines.push(
    `You are ONLY answering questions about the user's conversation with ${detail.displayName} (${detail.handle.identifier}).`,
  );
  lines.push("");
  lines.push(
    `Stats: ${detail.totalMessages} total messages | ${detail.messagesFromMe} from the user | ${detail.messagesFromThem} from ${detail.displayName}`,
  );
  if (detail.earliest && detail.latest) {
    lines.push(
      `Range: ${detail.earliest.toISOString().slice(0, 10)} → ${detail.latest.toISOString().slice(0, 10)}`,
    );
  }
  lines.push("");
  lines.push(
    `Below are ${detail.recentMessages.length} of the most recent messages, in chronological order:`,
  );
  lines.push("");
  for (const m of detail.recentMessages) {
    const dateStr = m.date.toISOString().slice(0, 10);
    const who = m.isFromMe ? "ME" : detail.displayName;
    const txt = m.text.length > 250 ? m.text.slice(0, 250) + "…" : m.text;
    lines.push(`[${dateStr}] [${who}] ${txt.replace(/\n/g, " ")}`);
  }

  const system = `You are answering questions about the user's conversation with ${detail.displayName} specifically. The transcript below is the actual conversation.

Rules:
- Answer ONLY based on what's in the transcript. Don't speculate about other contacts or invent context.
- Quote actual phrases when relevant. Cite dates (YYYY-MM-DD) when describing specific moments.
- Be specific. Don't generalize ("they seem nice") — name behaviors, recurring patterns, real moments.
- 2-5 sentences. Plain language. Never invent.
- If the user asks something not answerable from the transcript, say so plainly.`;

  return { context: lines.join("\n"), system };
}

function formatLastSeen(latest: Date | null): string {
  if (!latest) return "never";
  const days = Math.floor((Date.now() - latest.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
