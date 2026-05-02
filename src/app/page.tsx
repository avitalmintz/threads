export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col px-6 py-16 sm:px-12 sm:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <header className="mb-auto">
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)]">
            ghosts
          </p>
        </header>

        <section className="my-auto">
          <h1 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-[1.05] tracking-tight text-[var(--color-text)]">
            for the songs<br />you used to{" "}
            <span className="marker">love</span>.
          </h1>

          <p className="mt-8 max-w-md text-lg leading-relaxed text-[var(--color-text-muted)]">
            spotify shows your top tracks. apple music shows your top tracks.
            wrapped shows your top tracks.{" "}
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text)]">
              ghosts is for the other 80%
            </span>{" "}
            — the songs you saved once and stopped playing.
          </p>

          <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--color-text-muted)]">
            we read the lyrics of your forgotten library, find the patterns
            running through it, and surface one song you used to love every day.
          </p>

          <div className="mt-10">
            <a
              href="/api/auth/spotify"
              className="inline-flex items-center gap-2 border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] font-[family-name:var(--font-serif)] italic"
            >
              log in with spotify →
            </a>
          </div>
        </section>

        <footer className="mt-auto pt-16 text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic">
          est. 2026 · v0.1
        </footer>
      </div>
    </main>
  );
}
