// Opt-in full-archive deep dive. Runs the chunked map-reduce locally:
// every chunk and the final synthesis go through /api/llm. Result cached
// in IndexedDB by (handleId + 1:1 message count + latest date), so once
// it's run, subsequent visits are instant.

"use client";

import { useEffect, useState } from "react";
import {
  getCachedDeepDive,
  runDeepDive,
  type DeepDiveResult,
  type ProgressUpdate,
} from "@/lib/browser-deep-dive";

export function DeepDive({
  handleId,
  displayName,
}: {
  handleId: number;
  displayName: string;
}) {
  const [result, setResult] = useState<DeepDiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Separate "not eligible" state — different from a real failure (red).
  // Set when runDeepDive returns null because there aren't enough 1:1
  // messages with this contact to do a meaningful map-reduce read.
  const [notEnough, setNotEnough] = useState(false);
  const [checkedCache, setCheckedCache] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);

  // On mount, peek at the IndexedDB cache.
  useEffect(() => {
    let cancelled = false;
    getCachedDeepDive(handleId)
      .then((cached) => {
        if (!cancelled) {
          setResult(cached);
          setCheckedCache(true);
        }
      })
      .catch(() => setCheckedCache(true));
    return () => {
      cancelled = true;
    };
  }, [handleId]);

  async function trigger() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setNotEnough(false);
    setProgress(null);
    try {
      const r = await runDeepDive(handleId, displayName, (p) => {
        setProgress(p);
      });
      if (!r) {
        // Not a failure — just means this contact doesn't have enough 1:1
        // history to be worth chunking + summarizing.
        setNotEnough(true);
      } else {
        setResult(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <section className="mb-14">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        the full read,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-3 leading-tight">
        deep dive: every period of your friendship
      </h2>

      {!result && !loading && !notEnough && checkedCache && (
        <div className="border-l-2 border-[var(--color-rule-strong)] pl-5 py-2 max-w-prose">
          <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-3">
            the AI summary above reads a sample of your conversation. for a
            full read of every message you&apos;ve ever exchanged with this
            person, run a deep dive. cached forever once it finishes.
          </p>
          <button
            onClick={trigger}
            className="border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            run deep dive →
          </button>
        </div>
      )}

      {notEnough && !loading && (
        <p className="text-base text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)] leading-relaxed max-w-prose">
          not enough one-on-one messages with this person to do a deep dive.
          deep dives need at least 50 private messages between just the two
          of you (group-chat messages don&apos;t count).
        </p>
      )}

      {loading && (
        <div className="border-l-2 border-[var(--color-mood-summer)] pl-5 py-3 max-w-prose">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-block size-2 rounded-full bg-[var(--color-mood-summer)] animate-pulse" />
            <p className="text-base text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)]">
              {progress?.stage === "synthesizing"
                ? "synthesizing the full read…"
                : progress?.stage === "summarizing" && progress.total > 0
                ? `reading period ${progress.done} of ${progress.total}…`
                : "reading your full conversation…"}
            </p>
          </div>
          <p className="text-xs text-[var(--color-text-faint)] italic">
            this might take a few seconds. don&apos;t close the tab.
          </p>
        </div>
      )}

      {error && (
        <div className="border-l-2 border-[var(--mood-longing)] pl-5 py-3 max-w-prose">
          <p className="text-sm font-[family-name:var(--font-serif)] italic text-[var(--mood-longing)] mb-1">
            deep dive failed:
          </p>
          <pre className="text-xs text-[var(--color-text-muted)] font-mono whitespace-pre-wrap break-all">
            {error}
          </pre>
          <button
            onClick={trigger}
            className="mt-3 text-sm border-b border-[var(--color-text)] pb-0.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            try again →
          </button>
        </div>
      )}

      {result && (
        <div className="max-w-prose">
          <p className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] mb-4">
            analyzed {result.totalAnalyzed.toLocaleString()} of{" "}
            {result.totalMessages.toLocaleString()} messages, in{" "}
            {result.segments.length} period{result.segments.length === 1 ? "" : "s"}
          </p>

          {result.synthesis && (
            <p className="text-lg text-[var(--color-text)] leading-relaxed mb-6">
              {result.synthesis}
            </p>
          )}

          {result.segments.length > 0 && (
            <details
              open={showSegments}
              onToggle={(e) =>
                setShowSegments((e.target as HTMLDetailsElement).open)
              }
              className="mt-6"
            >
              <summary className="cursor-pointer list-none text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--color-text)] transition-colors select-none mb-3">
                {showSegments
                  ? "− hide period-by-period"
                  : `+ show ${result.segments.length} period${result.segments.length === 1 ? "" : "s"}, one at a time`}
              </summary>
              <ol className="space-y-5 mt-4 pl-2 border-l border-[var(--color-rule)]">
                {result.segments.map((s, i) => (
                  <li key={i} className="pl-4">
                    <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] mb-1">
                      {s.range}{" "}
                      <span className="text-[var(--color-rule-strong)]">·</span>{" "}
                      {s.messageCount.toLocaleString()} messages
                    </p>
                    <p className="text-sm text-[var(--color-text)] leading-relaxed">
                      {s.summary}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
