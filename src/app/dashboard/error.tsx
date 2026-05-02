"use client";

// Catches unhandled errors during dashboard render. Without this, Next.js
// shows a blank page in production and a noisy overlay in dev.

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative min-h-dvh px-6 py-12 sm:px-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] mb-12">
          ghosts
        </p>

        <h1 className="font-[family-name:var(--font-serif)] text-4xl italic leading-tight text-[var(--color-text)] mb-4">
          something went sideways.
        </h1>

        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose mb-6">
          ghosts hit an error while reading your spotify library. probably a
          rate limit or transient network blip — try again.
        </p>

        {error.message && (
          <pre className="text-xs text-[var(--color-text-faint)] mb-6 max-w-prose whitespace-pre-wrap break-all border-l-2 border-[var(--color-rule)] pl-3">
            {error.message}
          </pre>
        )}

        <div className="flex gap-4 flex-wrap text-base">
          <button
            onClick={() => reset()}
            className="border-b border-[var(--color-text)] pb-1 text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            try again
          </button>
          <a
            href="/api/auth/logout"
            className="border-b border-[var(--color-rule-strong)] pb-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            log out
          </a>
        </div>
      </div>
    </main>
  );
}
