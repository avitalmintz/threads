// Client-side texture summary. Pulls a stratified sample of this contact's
// messages from the in-browser chat.db, sends them through the /api/llm
// proxy, and renders the prose. Cached in IndexedDB by message-set hash so
// subsequent visits are instant.

"use client";

import { useEffect, useState } from "react";
import { getHandleDetail } from "@/lib/browser-db";
import {
  getTextureSummary,
  type TextureSummary as TextureSummaryT,
} from "@/lib/browser-per-contact-ai";

type State =
  | { kind: "loading" }
  | { kind: "ok"; summary: TextureSummaryT; sampleSize: number }
  | { kind: "not-enough" }
  | { kind: "error"; message: string };

export function TextureSummary({
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
        // 1:1 only — group-chat messages this contact sent are addressed
        // to whoever's in the group, not the user. Including them confuses
        // the texture analysis (e.g. nicknames meant for someone else).
        const detail = getHandleDetail(handleId, 3000, "auto", true);
        if (cancelled) return;
        if (!detail || detail.recentMessages.length < 10) {
          setState({ kind: "not-enough" });
          return;
        }
        const summary = await getTextureSummary(
          handleId,
          displayName,
          detail.recentMessages,
        );
        if (cancelled) return;
        if (!summary) {
          setState({
            kind: "error",
            message: "couldn't generate a summary right now — try refreshing.",
          });
          return;
        }
        setState({
          kind: "ok",
          summary,
          sampleSize: detail.recentMessages.length,
        });
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
          reading their voice in your messages…
        </p>
      </section>
    );
  }

  if (state.kind === "not-enough") {
    return (
      <section className="mb-14">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          how they talk to you,
        </p>
        <p className="text-base text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)]">
          not enough messages with this person to read their voice yet.
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="mb-14">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          how they talk to you,
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
        how they talk to you,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-4 leading-tight">
        their voice, in {state.sampleSize} of their messages
      </h2>
      <p className="text-lg text-[var(--color-text)] leading-relaxed max-w-prose">
        {state.summary.text}
      </p>
    </section>
  );
}
