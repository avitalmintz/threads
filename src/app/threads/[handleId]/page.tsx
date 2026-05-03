// Per-contact view. Reads from the browser's persisted chat.db + AddressBook.
//
// MVP — what's wired up:
//   - Header (display name + raw identifier)
//   - Stats grid (totals, span)
//   - Activity sparkline (monthly counts)
//   - TextureBlock (heatmap + peak day/hour, streaks, gaps, response times,
//     initiations) — all pure SQL, works fully in-browser
//
// Coming next (need a thin LLM proxy that doesn't read chat.db server-side):
//   - TextureSummary (how they talk to you)
//   - StrikingMomentsBlock (pull quotes)
//   - DeepDive (full-archive map-reduce)
//   - AskBox (per-contact Q&A)

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AskBox } from "@/components/AskBox";
import { DeepDive } from "@/components/threads/DeepDive";
import { StrikingMomentsBlock } from "@/components/threads/StrikingMomentsBlock";
import { TextureBlock } from "@/components/threads/TextureBlock";
import { TextureSummary } from "@/components/threads/TextureSummary";
import { loadAddressBooks } from "@/lib/browser-contacts";
import {
  getHandleDetail,
  getTextureStats,
  isOpen,
  openBrowserDb,
  type HandleDetail,
  type TextureStats,
} from "@/lib/browser-db";
import {
  hasChatDb,
  loadAddressBookBytes,
  loadChatDb,
} from "@/lib/browser-storage";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  return `${months[Number(m) - 1]} ${y}`;
}

function ActivitySparkline({
  monthlyCounts,
}: {
  monthlyCounts: { yearMonth: string; count: number }[];
}) {
  if (monthlyCounts.length === 0) return null;

  const w = 700;
  const h = 100;
  const max = Math.max(...monthlyCounts.map((m) => m.count));
  const barW = w / monthlyCounts.length;

  const labelIdxs = new Set<number>([
    0,
    Math.floor(monthlyCounts.length / 4),
    Math.floor(monthlyCounts.length / 2),
    Math.floor((3 * monthlyCounts.length) / 4),
    monthlyCounts.length - 1,
  ]);

  return (
    <svg
      width="100%"
      height={h + 24}
      viewBox={`0 0 ${w} ${h + 24}`}
      preserveAspectRatio="xMidYMid meet"
      className="max-w-full block"
    >
      {monthlyCounts.map((m, i) => {
        const barH = (m.count / max) * h;
        const x = i * barW;
        const y = h - barH;
        return (
          <g key={m.yearMonth}>
            <rect
              x={x + 0.5}
              y={y}
              width={Math.max(1, barW - 1)}
              height={barH}
              fill="var(--color-accent)"
              opacity="0.7"
            >
              <title>{`${formatYearMonth(m.yearMonth)}: ${m.count} messages`}</title>
            </rect>
            {labelIdxs.has(i) && (
              <text
                x={x + barW / 2}
                y={h + 14}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-text-faint)"
                fontStyle="italic"
                fontFamily="var(--font-serif)"
              >
                {formatYearMonth(m.yearMonth)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Phase =
  | { kind: "checking" }
  | { kind: "no-data" }
  | { kind: "loading"; stage: string }
  | {
      kind: "loaded";
      detail: HandleDetail;
      texture: TextureStats;
    }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

export default function HandleDetailPage({
  params,
}: {
  params: Promise<{ handleId: string }>;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { handleId } = await params;
        const id = Number(handleId);
        if (!Number.isFinite(id)) {
          setPhase({ kind: "not-found" });
          return;
        }

        const has = await hasChatDb();
        if (cancelled) return;
        if (!has) {
          setPhase({ kind: "no-data" });
          return;
        }

        if (!isOpen()) {
          setPhase({ kind: "loading", stage: "loading chat.db…" });
          const bytes = await loadChatDb();
          if (!bytes) {
            setPhase({ kind: "no-data" });
            return;
          }
          await openBrowserDb(bytes);
          setPhase({ kind: "loading", stage: "indexing contacts…" });
          const ab = await loadAddressBookBytes();
          if (ab.length > 0) await loadAddressBooks(ab);
        }

        setPhase({ kind: "loading", stage: "running queries…" });
        const detail = getHandleDetail(id, 30);
        if (!detail) {
          setPhase({ kind: "not-found" });
          return;
        }
        const texture = getTextureStats(id);
        if (cancelled) return;
        setPhase({ kind: "loaded", detail, texture });
      } catch (err) {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (phase.kind === "checking" || phase.kind === "loading") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/threads"
            className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-6 inline-block"
          >
            ← all conversations
          </Link>
          <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] animate-pulse">
            {phase.kind === "checking"
              ? "checking for saved data…"
              : phase.stage}
          </p>
        </div>
      </main>
    );
  }

  if (phase.kind === "no-data") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-4">
            no data uploaded yet
          </h1>
          <Link
            href="/onboard"
            className="border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            set up read receipts →
          </Link>
        </div>
      </main>
    );
  }

  if (phase.kind === "not-found") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/threads"
            className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-6 inline-block"
          >
            ← all conversations
          </Link>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)]">
            contact not found
          </h1>
        </div>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/threads"
            className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-6 inline-block"
          >
            ← all conversations
          </Link>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-4">
            something went wrong
          </h1>
          <pre className="text-xs text-[var(--color-text-faint)] font-mono whitespace-pre-wrap break-all border-l-2 border-[var(--color-rule)] pl-3">
            {phase.message}
          </pre>
        </div>
      </main>
    );
  }

  const { detail, texture } = phase;

  return (
    <main className="relative min-h-dvh px-6 py-12 sm:px-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between mb-12 flex-wrap gap-2">
          <Link
            href="/threads"
            className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            ← all conversations
          </Link>
          <p className="text-xs italic font-[family-name:var(--font-serif)] text-[var(--color-text-faint)]">
            {detail.handle.identifier}
          </p>
        </header>

        <section className="mb-12">
          <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
            you and,
          </p>
          <h1 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-tight text-[var(--color-text)] mb-2">
            {detail.contactName ?? (
              <span className="font-mono text-3xl sm:text-4xl">
                {detail.handle.identifier}
              </span>
            )}
          </h1>
        </section>

        {/* Stats row */}
        <section className="mb-14 border-t border-[var(--color-rule)] pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 text-sm">
            <div>
              <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
                total messages
              </p>
              <p className="font-[family-name:var(--font-serif)] text-2xl tabular-nums text-[var(--color-text)]">
                {detail.totalMessages.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
                from you
              </p>
              <p className="font-[family-name:var(--font-serif)] text-2xl tabular-nums text-[var(--color-text-muted)]">
                {detail.messagesFromMe.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
                from them
              </p>
              <p className="font-[family-name:var(--font-serif)] text-2xl tabular-nums text-[var(--color-text-muted)]">
                {detail.messagesFromThem.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
                span
              </p>
              <p className="font-[family-name:var(--font-serif)] text-sm italic text-[var(--color-text-muted)]">
                {formatDate(detail.earliest)} → {formatDate(detail.latest)}
              </p>
            </div>
          </div>
        </section>

        {/* Activity arc */}
        {detail.monthlyCounts.length > 0 && (
          <section className="mb-14">
            <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
              the arc,
            </p>
            <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-4 leading-tight">
              messages per month
            </h2>
            <ActivitySparkline monthlyCounts={detail.monthlyCounts} />
          </section>
        )}

        {/* Heatmap + texture stats — synchronous, fast */}
        <TextureBlock stats={texture} displayName={detail.displayName} />

        {/* AI texture summary — runs Claude on a sample of this contact's
            messages via /api/llm. Cached in IndexedDB by message hash. */}
        <TextureSummary
          handleId={detail.handle.id}
          displayName={detail.displayName}
        />

        {/* Striking moments — 3-5 editorial pull-quotes. */}
        <StrikingMomentsBlock
          handleId={detail.handle.id}
          displayName={detail.displayName}
        />

        {/* Deep dive — opt-in full-archive map-reduce read of EVERY 1:1
            message, chunked locally and synthesized via /api/llm. */}
        <DeepDive
          handleId={detail.handle.id}
          displayName={detail.displayName}
        />

        {/* Per-contact ask box — scoped to messages with this contact. */}
        <section className="mb-14 border-t border-[var(--color-rule)] pt-10">
          <AskBox
            scope={{
              contactId: detail.handle.id,
              displayName: detail.displayName,
            }}
          />
        </section>

        <footer className="mt-24 pt-8 border-t border-[var(--color-rule)] text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic flex justify-between flex-wrap gap-2">
          <Link
            href="/threads"
            className="hover:text-[var(--color-accent)] transition-colors"
          >
            ← back to all conversations
          </Link>
          <Link
            href="/onboard"
            className="hover:text-[var(--color-accent)] transition-colors"
          >
            settings →
          </Link>
        </footer>
      </div>
    </main>
  );
}
