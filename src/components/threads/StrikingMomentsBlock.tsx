// Client-side striking moments. Same pattern as TextureSummary: pull
// messages from in-browser chat.db, ask Claude (via /api/llm) to surface
// 3-5 pull-quotes, render them as editorial callouts.

"use client";

import { useEffect, useState } from "react";
import { getHandleDetail } from "@/lib/browser-db";
import {
  getStrikingMoments,
  type StrikingMoment,
} from "@/lib/browser-per-contact-ai";

type State =
  | { kind: "loading" }
  | { kind: "ok"; moments: StrikingMoment[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function StrikingMomentsBlock({
  handleId,
  displayName,
}: {
  handleId: number;
  displayName: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1:1 only — see TextureSummary for the rationale (group chats
        // misattribute nicknames / quotes to the user).
        const detail = getHandleDetail(handleId, 3000, "auto", true);
        if (cancelled) return;
        if (!detail || detail.recentMessages.length < 20) {
          setState({ kind: "empty" });
          return;
        }
        const moments = await getStrikingMoments(
          handleId,
          displayName,
          detail.recentMessages,
        );
        if (cancelled) return;
        if (moments.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ok", moments });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleId, displayName]);

  if (state.kind === "loading") {
    return (
      <section className="mb-14 border-l-2 border-dashed border-[var(--color-rule-strong)] pl-5 py-3">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide animate-pulse">
          surfacing striking moments…
        </p>
      </section>
    );
  }

  if (state.kind === "empty") return null;

  if (state.kind === "error") {
    return (
      <section className="mb-14">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          the moments that stand out,
        </p>
        <p className="text-sm text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)]">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-14">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        the moments that stand out,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-6 leading-tight">
        striking lines from your history
      </h2>

      <ol className="space-y-7">
        {state.moments.map((m, i) => {
          const isFromMe = m.sender.trim().toUpperCase() === "ME";
          return (
            <li key={i} className="grid grid-cols-[3rem_1fr] gap-x-4">
              <span className="font-[family-name:var(--font-serif)] italic text-3xl leading-none text-[var(--color-text-faint)] tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <blockquote
                  className="font-[family-name:var(--font-serif)] italic text-2xl sm:text-3xl text-[var(--color-text)] leading-snug mb-2"
                  style={{ textWrap: "balance" }}
                >
                  &ldquo;{m.text}&rdquo;
                </blockquote>
                <p className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)]">
                  — {isFromMe ? "you" : displayName.toLowerCase()}
                  <span className="text-[var(--color-rule-strong)] mx-1.5">·</span>
                  {m.date}
                  <span className="text-[var(--color-rule-strong)] mx-1.5">·</span>
                  <span className="text-[var(--color-text-muted)]">{m.why}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
