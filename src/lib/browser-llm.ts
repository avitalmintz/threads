// Browser-side LLM helper. Mirrors the API of `lib/llm.ts` but routes
// requests through `/api/llm` so the API key stays on the server. Also
// caches results in IndexedDB so re-renders / re-visits skip the network.

const PROXY_URL = "/api/llm";
const MODEL = "claude-haiku-4-5";

export type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type AnthropicResponse = {
  id: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage?: { input_tokens: number; output_tokens: number };
};

export async function callClaude(opts: {
  system: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  model?: string;
}): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model: opts.model ?? MODEL,
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;

  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`llm proxy ${res.status}: ${txt.slice(0, 500)}`);
  }
  return (await res.json()) as AnthropicResponse;
}

// Helper: extract concatenated text from a response's content blocks.
export function extractText(response: AnthropicResponse): string {
  return response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB result cache. Keyed by an arbitrary string the caller chooses
// (typically a hash of input message dates so it invalidates on content
// change). Stored under a single object store so we can wipe with one call.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = "threads-llm-cache";
const STORE = "results";

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function cachePut<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Cache write failures shouldn't fail the user-facing operation.
  }
}

// Cheap SHA-like hash: stable, fast, no crypto dependency. Used for cache
// keys derived from message-date lists. Collision risk is negligible at our
// scale (one user, ~500 contacts).
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul((h2 + c) | 0, 0x85ebca6b);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}
