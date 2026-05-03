// Deep-dive analysis, browser side. Mirrors `lib/deep-dive.ts` exactly:
// chunked map-reduce read of an entire conversation, with each chunk and
// the final synthesis going through `/api/llm`.
//
// All messages live in the browser already (via browser-db's
// getAllMessagesForHandle). We chunk them, fan out to the LLM proxy with
// bounded concurrency, then send the chunk summaries back through one more
// LLM call for synthesis. Result is cached in IndexedDB.
//
// Cost model: each chunk ≈ ~80k tokens. For an extreme-volume contact
// (~120k messages) we do up to 30 chunks ≈ ~$3-4 total, finishing in 30-90s.

import {
  cacheGet,
  cachePut,
  callClaude,
  extractText,
  stableHash,
} from "./browser-llm";
import { getAllMessagesForHandle, getHandleDetail } from "./browser-db";

const CHUNK_SIZE = 4000;
const MAX_CHUNKS = 30;
const CONCURRENCY = 3; // throttle to stay under Anthropic's 450k tokens/min

export type DeepDiveSegment = {
  range: string;
  startDate: string;
  endDate: string;
  messageCount: number;
  summary: string;
};

export type DeepDiveResult = {
  totalMessages: number;
  totalAnalyzed: number;
  segments: DeepDiveSegment[];
  synthesis: string;
  generatedAt: number;
};

const CHUNK_PROMPT = `You are analyzing one slice of a longer conversation between the user and a specific contact. The slice covers a specific date range.

Read the messages and write a 2-4 sentence summary of THIS PERIOD specifically. Capture:
- What they were talking about during this window (concrete topics, recurring themes)
- The tone/dynamic in this period (warm, distant, dramatic, mundane?)
- Any notable single events visible in the messages (a fight, a milestone, a shared trip)
- 1-2 specific quoted phrases (in single quotes) that capture the period

Hard rules:
- Be specific to THIS SLICE. Don't generalize about the whole relationship.
- Quote actual messages verbatim where useful.
- 2-4 sentences. No bullets. Plain prose.
- No prefix like "In this period". Just write the summary directly.`;

const SYNTHESIS_PROMPT = `You are synthesizing a complete relationship analysis from period-by-period summaries of an entire conversation. Each summary covers a window of time.

Write a 5-8 sentence synthesis that captures the SHAPE of this relationship over time. Cover:
- How the relationship has evolved (tonal shifts, growing closer or apart, evolving topics)
- What's CONSISTENT across all periods (the through-line)
- Notable turning points or distinct chapters
- A specific texture: how this person is present in the user's life

Hard rules:
- Be specific. Quote phrases from the period summaries when they capture something well.
- Plain prose. No bullets or numbered lists.
- Don't list the periods chronologically as a recap; weave them into a real synthesis.
- 5-8 sentences. No labels, no headings, just prose.`;

function formatChunkForClaude(
  messages: { date: Date; isFromMe: boolean; text: string }[],
  contactName: string,
): string {
  return messages
    .map((m) => {
      const dateStr = m.date.toISOString().slice(0, 10);
      const who = m.isFromMe ? "ME" : contactName;
      const text = m.text.length > 200 ? m.text.slice(0, 200) + "…" : m.text;
      return `[${dateStr}] [${who}] ${text.replace(/\n/g, " ")}`;
    })
    .join("\n");
}

function dateRangeLabel(start: Date, end: Date): string {
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const startStr = `${months[start.getMonth()]} ${start.getFullYear()}`;
  const endStr = `${months[end.getMonth()]} ${end.getFullYear()}`;
  if (startStr === endStr) return startStr;
  return `${startStr} → ${endStr}`;
}

function cacheKey(handleId: number, totalCount: number, latest: Date): string {
  // Same shape as the server cache: invalidate when message count or latest
  // message date changes.
  return `deep-dive:${handleId}:${totalCount}:${stableHash(
    latest.toISOString().slice(0, 10),
  )}`;
}

export async function getCachedDeepDive(
  handleId: number,
): Promise<DeepDiveResult | null> {
  const detail = getHandleDetail(handleId, 1);
  if (!detail || !detail.latest) return null;
  // Match runDeepDive's 1:1-only message count for cache-key consistency.
  const all = getAllMessagesForHandle(handleId, true);
  const key = cacheKey(handleId, all.length, detail.latest);
  return await cacheGet<DeepDiveResult>(key);
}

export type ProgressUpdate = {
  stage: "loading" | "chunking" | "summarizing" | "synthesizing" | "done";
  /** chunks summarized so far, of `total`. */
  done: number;
  total: number;
};

export async function runDeepDive(
  handleId: number,
  contactName: string,
  onProgress?: (p: ProgressUpdate) => void,
): Promise<DeepDiveResult | null> {
  const detail = getHandleDetail(handleId, 1);
  if (!detail || !detail.latest) return null;

  onProgress?.({ stage: "loading", done: 0, total: 0 });
  // 1:1 only — the deep dive is about "every period of your friendship",
  // which means the private back-and-forth, not group-chat messages.
  const all = getAllMessagesForHandle(handleId, true);
  if (all.length < 50) return null;

  const key = cacheKey(handleId, all.length, detail.latest);
  const cached = await cacheGet<DeepDiveResult>(key);
  if (cached) return cached;

  // Stratified-by-time sample if the conversation exceeds the chunk budget.
  const totalNeeded = Math.min(all.length, MAX_CHUNKS * CHUNK_SIZE);
  let toAnalyze = all;
  if (all.length > totalNeeded) {
    const stride = all.length / totalNeeded;
    toAnalyze = Array.from(
      { length: totalNeeded },
      (_, i) => all[Math.floor(i * stride)],
    );
  }

  onProgress?.({ stage: "chunking", done: 0, total: 0 });
  const chunks: { date: Date; isFromMe: boolean; text: string }[][] = [];
  for (let i = 0; i < toAnalyze.length; i += CHUNK_SIZE) {
    chunks.push(toAnalyze.slice(i, i + CHUNK_SIZE));
  }

  const segments: (DeepDiveSegment | null)[] = new Array(chunks.length).fill(null);
  let completed = 0;
  onProgress?.({ stage: "summarizing", done: 0, total: chunks.length });

  // Bounded-concurrency pool. We slice the chunk list into worker queues
  // so we never exceed CONCURRENCY in flight at once.
  async function worker(slot: number) {
    for (let i = slot; i < chunks.length; i += CONCURRENCY) {
      segments[i] = await processChunk(chunks[i], contactName);
      completed++;
      onProgress?.({
        stage: "summarizing",
        done: completed,
        total: chunks.length,
      });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, (_, i) =>
      worker(i),
    ),
  );

  const valid = segments.filter((s): s is DeepDiveSegment => s !== null && s.summary.length > 0);
  if (valid.length === 0) return null;

  // Reduce: synthesize across chunk summaries.
  onProgress?.({
    stage: "synthesizing",
    done: chunks.length,
    total: chunks.length,
  });
  const synthesisInput = valid
    .map((s) => `[${s.range}] (${s.messageCount} msgs)\n${s.summary}`)
    .join("\n\n");

  let synthesis = "";
  try {
    const response = await callClaude({
      system: SYNTHESIS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Period summaries from a conversation between me and ${contactName}, in chronological order:\n\n${synthesisInput}\n\nWrite the synthesis.`,
        },
      ],
      maxTokens: 800,
    });
    synthesis = extractText(response).trim();
  } catch (err) {
    console.warn("deep dive synthesis failed:", err);
  }

  const result: DeepDiveResult = {
    totalMessages: all.length,
    totalAnalyzed: toAnalyze.length,
    segments: valid,
    synthesis,
    generatedAt: Date.now(),
  };

  await cachePut(key, result);
  onProgress?.({
    stage: "done",
    done: chunks.length,
    total: chunks.length,
  });
  return result;
}

async function processChunk(
  chunk: { date: Date; isFromMe: boolean; text: string }[],
  contactName: string,
): Promise<DeepDiveSegment> {
  const start = chunk[0].date;
  const end = chunk[chunk.length - 1].date;
  const range = dateRangeLabel(start, end);
  const transcript = formatChunkForClaude(chunk, contactName);
  try {
    const response = await callClaude({
      system: CHUNK_PROMPT,
      messages: [
        {
          role: "user",
          content: `Period: ${range} (${chunk.length} messages between me and ${contactName}).\n\n${transcript}\n\nSummarize this period.`,
        },
      ],
      maxTokens: 400,
    });
    return {
      range,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      messageCount: chunk.length,
      summary: extractText(response).trim(),
    };
  } catch (err) {
    console.warn(`deep dive chunk failed (${range}):`, err);
    return {
      range,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      messageCount: chunk.length,
      summary: "",
    };
  }
}
