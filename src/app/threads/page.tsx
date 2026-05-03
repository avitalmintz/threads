// "Your people" — the main contact list. Reads everything client-side from
// the chat.db + AddressBook the user persisted to OPFS during onboarding.
// If they haven't uploaded yet, send them to /onboard.
//
// AskBox temporarily hidden: it posts to /api/ask, which still reads chat.db
// from the dev's filesystem. We'll re-enable it once the API is refactored
// to a thin LLM proxy that accepts message context from the browser.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AskBox } from "@/components/AskBox";
import { loadAddressBooks } from "@/lib/browser-contacts";
import {
  getHandleSummaries,
  getStats,
  isOpen,
  openBrowserDb,
  type ChatDatabaseStats,
  type HandleSummary,
} from "@/lib/browser-db";
import {
  hasChatDb,
  loadAddressBookBytes,
  loadChatDb,
} from "@/lib/browser-storage";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// daysSince — Date.now() lives outside the component to dodge the
// react-hooks/purity rule, which flags impure calls anywhere in a
// component scope (even in event handlers / effects).
const today = (): number => Date.now();
function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((today() - d.getTime()) / 86400000);
}

function classifyActivity(s: HandleSummary): { label: string; color: string } {
  if (s.recent30 >= 5) return { label: "active", color: "var(--mood-fluorescent)" };
  if (s.recent90 >= 5) return { label: "quieter lately", color: "var(--mood-summer)" };
  if (s.recent365 >= 5) return { label: "fading", color: "var(--mood-longing)" };
  const days = daysSince(s.latest);
  if (days !== null && days < 365 * 3) {
    return { label: "drifted", color: "var(--mood-blue)" };
  }
  return { label: "long quiet", color: "var(--text-faint)" };
}

type Phase =
  | { kind: "checking" }
  | { kind: "no-data" }
  | { kind: "loading"; stage: string }
  | { kind: "loaded"; stats: ChatDatabaseStats; summaries: HandleSummary[] }
  | { kind: "error"; message: string };

export default function ThreadsPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const has = await hasChatDb();
        if (cancelled) return;
        if (!has) {
          setPhase({ kind: "no-data" });
          return;
        }

        // Reuse an open DB from a sibling page if possible (e.g. coming
        // from /onboard, where we opened it after persist). Otherwise rehydrate.
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

        setPhase({ kind: "loading", stage: "ranking your people…" });
        const stats = getStats();
        const summaries = getHandleSummaries();
        if (cancelled) return;
        setPhase({ kind: "loaded", stats, summaries });
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
  }, []);

  if (phase.kind === "checking" || phase.kind === "loading") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
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
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] mb-6">
            threads
          </p>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl italic text-[var(--color-text)] mb-4 leading-tight">
            no data uploaded yet
          </h1>
          <p className="text-base text-[var(--color-text-muted)] max-w-prose mb-6 leading-relaxed">
            threads needs a copy of your <code>chat.db</code> +{" "}
            <code>AddressBook</code> to read. it all stays in your browser.
          </p>
          <Link
            href="/onboard"
            className="inline-block border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            set up threads →
          </Link>
        </div>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] mb-6">
            threads
          </p>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl italic text-[var(--color-text)] mb-4 leading-tight">
            couldn&apos;t read your data
          </h1>
          <pre className="text-xs text-[var(--color-text-faint)] font-mono mb-6 max-w-prose whitespace-pre-wrap break-all border-l-2 border-[var(--color-rule)] pl-3">
            {phase.message}
          </pre>
          <Link
            href="/onboard"
            className="inline-block border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            ← back to setup
          </Link>
        </div>
      </main>
    );
  }

  const { stats, summaries } = phase;
  const usable = summaries.filter((s) => s.totalMessages >= 5);
  const namedCount = usable.filter((s) => !!s.contactName).length;

  return (
    <main className="relative min-h-dvh px-6 py-12 sm:px-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-baseline justify-between mb-12 flex-wrap gap-2">
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)]">
            threads
          </p>
          <p className="text-xs italic font-[family-name:var(--font-serif)] text-[var(--color-text-faint)]">
            {formatNumber(stats.messageCount)} messages ·{" "}
            {formatNumber(usable.length)} people · {namedCount} named ·{" "}
            {formatDate(stats.earliestMessage)} →{" "}
            {formatDate(stats.latestMessage)}
          </p>
        </header>

        {/* Q&A box at the top — semantic search across the whole archive,
            with the tool-use loop running locally against the in-memory
            chat.db. Each LLM call goes through /api/llm. */}
        <AskBox />

        <section className="mb-8 mt-16">
          <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
            everyone you&apos;ve talked to,
          </p>
          <h1 className="font-[family-name:var(--font-serif)] text-4xl sm:text-5xl italic leading-tight text-[var(--color-text)] mb-3">
            your people
          </h1>
          <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
            ranked by total messages exchanged. click anyone to see your full
            history with them.
          </p>
          {namedCount === 0 && (
            <div className="mt-4 border-l-2 border-[var(--color-mood-longing)] pl-4 py-2 max-w-prose">
              <p className="text-sm text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)] mb-2">
                no names resolved, only raw phone numbers / emails shown.
              </p>
              <p className="text-xs text-[var(--color-text-faint)] leading-relaxed">
                go back to <Link href="/onboard" className="underline">setup</Link>{" "}
                and upload your AddressBook folder to map them.
              </p>
            </div>
          )}
        </section>

        <ol className="divide-y divide-[var(--color-rule)]">
          {usable.map((s, idx) => {
            const cls = classifyActivity(s);
            const lastDays = daysSince(s.latest);
            return (
              <li key={s.handle.id}>
                <Link
                  href={`/threads/${s.handle.id}`}
                  className="grid grid-cols-[2rem_1fr_auto_auto] items-baseline gap-3 sm:gap-5 py-3 hover:bg-[var(--color-surface)] transition-colors -mx-2 px-2 rounded"
                >
                  <span className="font-[family-name:var(--font-serif)] italic text-xs text-[var(--color-text-faint)] tabular-nums">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <span
                      className={`text-base truncate block ${
                        s.contactName
                          ? "text-[var(--color-text)]"
                          : "text-[var(--color-text-muted)] font-mono text-sm"
                      }`}
                    >
                      {s.displayName}
                    </span>
                    <span className="text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic">
                      last:{" "}
                      {lastDays === null
                        ? "—"
                        : lastDays < 1
                        ? "today"
                        : lastDays === 1
                        ? "yesterday"
                        : lastDays < 30
                        ? `${lastDays}d ago`
                        : lastDays < 365
                        ? `${Math.round(lastDays / 30)}mo ago`
                        : `${Math.round(lastDays / 365)}y ago`}
                      <span className="text-[var(--color-rule-strong)] mx-1.5">·</span>
                      {formatDate(s.earliest)} → {formatDate(s.latest)}
                      {s.contactName && (
                        <>
                          <span className="text-[var(--color-rule-strong)] mx-1.5">·</span>
                          <span className="font-mono">{s.handle.identifier}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <span
                    className="text-xs font-[family-name:var(--font-serif)] italic whitespace-nowrap"
                    style={{ color: cls.color }}
                  >
                    {cls.label}
                  </span>
                  <span className="text-sm text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
                    {formatNumber(s.totalMessages)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        {usable.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)] mt-8">
            no contacts with 5+ messages found.
          </p>
        )}

        <footer className="mt-24 pt-8 border-t border-[var(--color-rule)] text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic flex flex-wrap gap-3 justify-between">
          <span>
            threads · v0.1 · reading {formatNumber(stats.messageCount)} messages locally
          </span>
          <Link href="/onboard" className="hover:text-[var(--color-accent)] transition-colors">
            settings →
          </Link>
        </footer>
      </div>
    </main>
  );
}
