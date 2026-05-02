export function ForgottenThemes({
  gist,
  themes,
}: {
  gist: string;
  themes: string[];
}) {
  if (!gist && themes.length === 0) {
    return (
      <section id="forgotten-themes" className="scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          what your forgotten library is about,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          themes of the forgotten
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          we couldn&apos;t pull lyrics for enough of your forgotten songs to
          analyze them. happens when lrclib doesn&apos;t cover the artists.
        </p>
      </section>
    );
  }

  return (
    <section id="forgotten-themes" className="scroll-mt-16 relative">
      <span
        aria-hidden
        className="absolute -left-2 -top-4 text-6xl text-[var(--color-accent)] opacity-15 font-[family-name:var(--font-serif)] italic select-none"
      >
        ✻
      </span>

      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        what your forgotten library is about,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        themes of the forgotten
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-6 max-w-prose">
        we read the lyrics of your forgotten songs as a single group. here is
        what they share — patterns no other music app will tell you about
        yourself.
      </p>

      {gist && (
        <p className="text-xl leading-relaxed text-[var(--color-text)] mb-5 max-w-prose">
          <span
            aria-hidden
            className="float-left mr-2 mt-1 font-[family-name:var(--font-serif)] italic leading-[0.85] text-5xl sm:text-6xl text-[var(--color-accent)]"
          >
            {gist[0]}
          </span>
          {gist.slice(1)}
        </p>
      )}

      {themes.length > 0 && (
        <details className="mt-6 group">
          <summary className="cursor-pointer list-none text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--color-text)] transition-colors select-none inline-flex items-baseline gap-1">
            <span className="group-open:hidden">+ more detail</span>
            <span className="hidden group-open:inline">− less</span>
          </summary>
          <ul className="mt-3 flex items-baseline gap-x-2 gap-y-1 flex-wrap text-sm text-[var(--color-text-muted)]">
            {themes.map((t, i) => (
              <li
                key={t}
                className="font-[family-name:var(--font-serif)] italic"
              >
                <span className="text-[var(--color-accent)]">{t}</span>
                {i < themes.length - 1 && (
                  <span className="text-[var(--color-text-faint)]"> ·</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
