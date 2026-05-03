// Thin LLM proxy. The browser builds the full Anthropic request body
// (system, messages, tools, max_tokens, etc.) and POSTs it here; we attach
// the API key (server-side only — never shipped to the client) and forward.
//
// Why not let the browser talk to Anthropic directly: the API key would
// have to live in the bundle, which means anyone could grab it and ring up
// our bill. The proxy keeps it server-side.
//
// Defense in depth against abuse:
//   - Per-IP rate limit (token bucket, in-memory). Survives within a single
//     serverless instance; cold starts reset the bucket. That's fine — the
//     hard cost cap is set on Anthropic's dashboard ($X/month).
//   - Hard request cap on max_tokens to prevent runaway 200k-token replies.
//   - Origin allowlist in production so the endpoint can't be hit from
//     arbitrary other sites.

import { NextRequest } from "next/server";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";
const HARD_MAX_TOKENS = 4096; // refuse anything bigger
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.threads\..*)/;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Token-bucket rate limit, per-IP. In-memory — fine for our scale.
//
// 60 requests/minute, refilling 1/sec. Bursts of 60 OK, sustained traffic
// throttles. Generous for honest use (a deep dive on a heavy contact uses
// ~30 calls), tight enough to make scraping expensive.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET_CAPACITY = 60;
const REFILL_PER_SEC = 1;
const BUCKET_TTL_MS = 30 * 60 * 1000; // forget IPs after 30m of silence

type Bucket = { tokens: number; lastRefill: number; lastSeen: number };
const buckets: Map<string, Bucket> = new Map();

function ipFromRequest(req: NextRequest): string {
  // Vercel sets x-forwarded-for; locally there's no proxy. NextRequest.ip
  // exists in some runtimes but not all — fall back to the header.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function takeToken(ip: string): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  // Periodic GC of stale buckets so the map doesn't grow unbounded.
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) {
      if (now - b.lastSeen > BUCKET_TTL_MS) buckets.delete(k);
    }
  }

  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY, lastRefill: now, lastSeen: now };
    buckets.set(ip, b);
  }

  // Refill based on elapsed time
  const elapsedSec = (now - b.lastRefill) / 1000;
  if (elapsedSec > 0) {
    b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsedSec * REFILL_PER_SEC);
    b.lastRefill = now;
  }
  b.lastSeen = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true };
  }
  // Tokens needed = 1; time to wait = 1 / refillRate seconds
  const retryAfterSec = Math.ceil((1 - b.tokens) / REFILL_PER_SEC);
  return { ok: false, retryAfterSec };
}

function isAllowedOrigin(req: NextRequest): boolean {
  // Skip origin checks in dev (no NODE_ENV=production set)
  if (process.env.NODE_ENV !== "production") return true;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Same-origin requests from the page itself — Next.js sometimes omits
    // the Origin header. Fall back to checking the Referer.
    const referer = req.headers.get("referer");
    if (!referer) return true; // server-to-server, accept
    return ALLOWED_ORIGIN_RE.test(referer);
  }
  return ALLOWED_ORIGIN_RE.test(origin);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = process.env.THREADS_LLM_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "THREADS_LLM_KEY not set on the server" },
      { status: 500 },
    );
  }

  if (!isAllowedOrigin(request)) {
    return Response.json({ error: "origin not allowed" }, { status: 403 });
  }

  const ip = ipFromRequest(request);
  const limit = takeToken(ip);
  if (!limit.ok) {
    return Response.json(
      { error: "rate limit exceeded — slow down" },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSec ?? 1) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "body must be an object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (!b.model || !b.max_tokens || !b.messages) {
    return Response.json(
      { error: "missing required fields: model, max_tokens, messages" },
      { status: 400 },
    );
  }

  // Cap max_tokens. Even if a malicious client asks for 200k output, we
  // refuse — every additional output token is real money.
  if (typeof b.max_tokens === "number" && b.max_tokens > HARD_MAX_TOKENS) {
    b.max_tokens = HARD_MAX_TOKENS;
  }

  // Retry on 429 / 529 with exponential backoff (mirrors the legacy lib/llm.ts).
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(b),
      cache: "no-store",
    });

    if (res.ok) {
      const json = await res.json();
      return Response.json(json);
    }

    const text = await res.text();
    if ((res.status === 429 || res.status === 529) && attempt < MAX_ATTEMPTS - 1) {
      const retryAfterRaw = res.headers.get("retry-after");
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : null;
      const backoffMs = retryAfterSec
        ? Math.min(retryAfterSec * 1000, 30_000)
        : Math.min(2000 * Math.pow(2, attempt), 30_000);
      await sleep(backoffMs);
      continue;
    }

    return Response.json(
      { error: `anthropic ${res.status}: ${text.slice(0, 500)}` },
      { status: res.status },
    );
  }

  return Response.json({ error: "exhausted retries" }, { status: 502 });
}
