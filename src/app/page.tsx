// Public landing page. Pure client-side: no filesystem reads, no server
// dependencies. Detects whether the visitor has already onboarded (chat.db
// in OPFS) and routes them appropriately. First-time visitors see the
// pitch, returning visitors skip straight to /threads.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasChatDb } from "@/lib/browser-storage";

export default function Home() {
  const [hasData, setHasData] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasChatDb()
      .then((v) => {
        if (!cancelled) setHasData(v);
      })
      .catch(() => {
        if (!cancelled) setHasData(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col px-6 py-12 sm:px-12 sm:py-20">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <header className="mb-12">
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)]">
            threads
          </p>
        </header>

        <section className="mb-16">
          <h1 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-[1.05] tracking-tight text-[var(--color-text)]">
            your conversations,
            <br />
            <span className="marker">mapped</span>.
          </h1>

          <p className="mt-8 max-w-md text-lg leading-relaxed text-[var(--color-text-muted)]">
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text)]">
              threads
            </span>{" "}
            reads your iMessage history and shows you your relationships over
            time. who you talk to, what you talk about, who you&apos;ve
            drifted from, and what&apos;s been said.
          </p>

          <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--color-text-muted)]">
            ask it questions in plain language.{" "}
            <span className="font-[family-name:var(--font-serif)] italic">
              who do i fight with most? who haven&apos;t i texted in months?
              when did mom start asking about the apartment?
            </span>
          </p>
        </section>

        {/* Prominent local-data callout. Sits between the pitch and the CTA
            so anyone clicking through sees it before deciding to upload. */}
        <section className="mb-16 max-w-prose">
          <div className="border-l-2 border-[var(--color-accent,#7a8c5a)] pl-5 py-2">
            <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-1">
              100% local,
            </p>
            <p className="text-base text-[var(--color-text)] leading-relaxed">
              your messages never get uploaded. <code>chat.db</code> is read
              entirely in your browser via WebAssembly SQLite. there&apos;s
              no account, no cloud sync, and no server ever sees your file.
            </p>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-2">
              the only thing that goes to an LLM is short, question-relevant
              snippets, and only when you ask.
            </p>
          </div>
        </section>

        <section className="mb-16">
          {hasData === null ? (
            <p className="text-sm italic text-[var(--color-text-faint)] animate-pulse">
              checking…
            </p>
          ) : hasData ? (
            <>
              <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
                welcome back,
              </p>
              <Link
                href="/threads"
                className="inline-flex items-center gap-2 border-b-2 border-[var(--color-text)] pb-1 text-2xl text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
              >
                open your threads →
              </Link>
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
                to start,
              </p>
              <Link
                href="/onboard"
                className="inline-flex items-center gap-2 border-b-2 border-[var(--color-text)] pb-1 text-2xl text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
              >
                set up threads →
              </Link>
              <p className="mt-3 text-xs italic text-[var(--color-text-faint)] font-[family-name:var(--font-serif)]">
                Mac only · takes about a minute
              </p>
            </>
          )}
        </section>

        <footer className="mt-auto pt-6 border-t border-[var(--color-rule)] text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic flex flex-wrap gap-4 justify-between">
          <span>est. 2026 · v0.1</span>
          {hasData && (
            <Link
              href="/onboard"
              className="hover:text-[var(--color-accent)] transition-colors"
            >
              settings →
            </Link>
          )}
        </footer>
      </div>
    </main>
  );
}
