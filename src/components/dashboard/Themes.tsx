import type { Theme } from "@/lib/mock-data";

export function Themes({ themes }: { themes: Theme[] }) {
  return (
    <section>
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        what your songs are{" "}
        <span className="font-[family-name:var(--font-serif)] italic">about</span>,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        your themes
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-10 max-w-prose">
        ghosts reads the lyrics of every song you love (via genius) and
        finds the things you keep returning to. not single words — actual
        recurring preoccupations.{" "}
        <span className="font-[family-name:var(--font-serif)] italic">
          most music apps will never tell you this about yourself.
        </span>
      </p>

      <ol className="space-y-7">
        {themes.map((theme, i) => (
          <li key={theme.id} className="relative">
            <div className="flex items-baseline gap-4 mb-2">
              <span className="font-[family-name:var(--font-serif)] italic text-lg text-[var(--color-text-faint)] w-8 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h3
                    className="font-[family-name:var(--font-serif)] italic text-2xl leading-tight"
                    style={{ color: theme.hue }}
                  >
                    {theme.name}
                  </h3>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {theme.songCount} songs
                  </span>
                </div>
                <blockquote
                  className="mt-2 pl-4 border-l-2 italic text-base leading-relaxed text-[var(--color-text)]"
                  style={{ borderColor: theme.hue }}
                >
                  &ldquo;{theme.exampleLyric}&rdquo;
                  <footer className="not-italic text-xs text-[var(--color-text-faint)] mt-1.5">
                    —{" "}
                    <span className="font-[family-name:var(--font-serif)] italic">
                      {theme.exampleSong.title}
                    </span>{" "}
                    by {theme.exampleSong.artist}
                  </footer>
                </blockquote>
                <a
                  href="#"
                  className="inline-block mt-3 text-sm border-b pb-0.5 transition-colors font-[family-name:var(--font-serif)] italic hover:opacity-70"
                  style={{
                    color: theme.hue,
                    borderColor: theme.hue,
                  }}
                >
                  open the playlist →
                </a>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
