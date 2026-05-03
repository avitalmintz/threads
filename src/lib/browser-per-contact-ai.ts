// Per-contact AI analyses, browser side. Same prompts and same shape as the
// server module (`lib/per-contact-ai.ts`); the only differences are:
//   - LLM calls go through the `/api/llm` proxy (`browser-llm.ts`)
//   - cache lives in IndexedDB instead of a JSON file on disk
//   - message extraction is done by the caller (browser-db) and passed in

import {
  cacheGet,
  cachePut,
  callClaude,
  extractText,
  stableHash,
} from "./browser-llm";

export type ConversationMessage = {
  date: Date;
  isFromMe: boolean;
  text: string;
};

function formatTranscript(
  messages: ConversationMessage[],
  contactName: string,
  maxChars = 80000,
): string {
  const lines: string[] = [];
  for (const m of messages) {
    const dateStr = m.date.toISOString().slice(0, 10);
    const who = m.isFromMe ? "ME" : contactName;
    const text = m.text.length > 250 ? m.text.slice(0, 250) + "…" : m.text;
    lines.push(`[${dateStr}] [${who}] ${text.replace(/\n/g, " ")}`);
  }
  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out;
}

function buildCacheKey(
  prefix: string,
  handleId: number,
  messages: ConversationMessage[],
): string {
  const dates = messages.map((m) => m.date.toISOString().slice(0, 16)).join(",");
  return `${prefix}:${handleId}:${stableHash(dates)}`;
}

// === Texture summary ===

const TEXTURE_PROMPT = `You are analyzing how a specific person talks to the user, based on their actual messages. Read the transcript and describe HOW this person communicates — their voice, tone, patterns, what's distinctive about them in this relationship.

Cover (where you have evidence):
- Nicknames or pet names they use for the user
- Recurring phrases or inside-joke language
- Tone (warm? blunt? sarcastic? formal? playful?)
- How they emote (emojis, all-caps, lowercase, punctuation patterns)
- Length / cadence (long thoughtful messages vs rapid-fire shorts)
- What they typically text about (logistics? emotional check-ins? jokes? complaints?)

Hard rules:
- Be SPECIFIC. Quote actual short phrases they say (in single quotes). Don't generalize.
- 4-6 short sentences. Plain language. No bullet lists.
- No hedging ("seems to", "appears to be"). Just observations.
- Write in second person about the user ("she calls you Lukie", not "she calls them Lukie").

Output ONLY the prose paragraph. No prefix, no labels.`;

export type TextureSummary = {
  text: string;
  generatedAt: number;
};

export async function getTextureSummary(
  handleId: number,
  contactName: string,
  messages: ConversationMessage[],
): Promise<TextureSummary | null> {
  if (messages.length < 10) return null;

  const key = buildCacheKey("texture", handleId, messages);
  const cached = await cacheGet<TextureSummary>(key);
  if (cached) return cached;

  const transcript = formatTranscript(messages, contactName);
  try {
    const response = await callClaude({
      system: TEXTURE_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here are messages between me and ${contactName} (${messages.length} messages, chronological):\n\n${transcript}\n\nDescribe how ${contactName} talks to me.`,
        },
      ],
      maxTokens: 600,
    });
    const text = extractText(response).trim();
    const result: TextureSummary = { text, generatedAt: Date.now() };
    await cachePut(key, result);
    return result;
  } catch (err) {
    console.warn(`getTextureSummary failed for ${handleId}:`, err);
    return null;
  }
}

// === Striking moments ===

const STRIKING_PROMPT = `You are surfacing 3-5 STRIKING individual messages from a conversation transcript — the ones that, looking back, feel emotionally significant, funny, distinctive, or memorable. Editorial pull-quotes from a friendship.

Pick messages where ANY of these apply:
- An unusually direct emotional moment (love, anger, vulnerability, sincerity)
- A genuinely funny line or callback
- A recurring inside-joke phrase the FIRST time it appears
- A message that captures something larger about the relationship
- A message that feels like a turning point (ending, reconciliation, big news)

Hard rules:
- Pick from the ACTUAL messages in the transcript. Quote them VERBATIM (typos and all).
- Each pick gets a one-line tag (3-7 words) describing what makes it striking.
- Spread picks across time when possible — don't all be from last week.
- 3-5 picks. No more.

Output as a JSON array of objects with keys: "date" (YYYY-MM-DD from the transcript), "sender" ("ME" or contact name), "text" (verbatim message), "why" (one-line tag). No prose around it, no markdown fences.

Example:
[
  {"date": "2024-08-15", "sender": "Sarah", "text": "i miss u angel", "why": "first time she calls you angel"},
  {"date": "2025-03-02", "sender": "ME", "text": "I think this is the worst thing that's ever happened", "why": "rare full sentence vulnerability"}
]`;

export type StrikingMoment = {
  date: string;
  sender: string;
  text: string;
  why: string;
};

export async function getStrikingMoments(
  handleId: number,
  contactName: string,
  messages: ConversationMessage[],
): Promise<StrikingMoment[]> {
  if (messages.length < 20) return [];

  const key = buildCacheKey("striking", handleId, messages);
  const cached = await cacheGet<StrikingMoment[]>(key);
  if (cached) return cached;

  const transcript = formatTranscript(messages, contactName);
  try {
    const response = await callClaude({
      system: STRIKING_PROMPT,
      messages: [
        {
          role: "user",
          content: `Transcript between me and ${contactName} (${messages.length} messages):\n\n${transcript}\n\nFind 3-5 striking moments.`,
        },
      ],
      maxTokens: 800,
    });
    const text = extractText(response).trim();
    const parsed = parseStrikingMoments(text);
    await cachePut(key, parsed);
    return parsed;
  } catch (err) {
    console.warn(`getStrikingMoments failed for ${handleId}:`, err);
    return [];
  }
}

function parseStrikingMoments(raw: string): StrikingMoment[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is Record<string, unknown> =>
          typeof m === "object" && m !== null,
      )
      .map((m) => ({
        date: typeof m.date === "string" ? m.date : "",
        sender: typeof m.sender === "string" ? m.sender : "",
        text: typeof m.text === "string" ? m.text : "",
        why: typeof m.why === "string" ? m.why : "",
      }))
      .filter((m) => m.text && m.date)
      .slice(0, 5);
  } catch {
    return [];
  }
}
