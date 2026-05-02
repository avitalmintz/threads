import type { ForgottenStratum } from "@/lib/analysis";

const yearColors = [
  "var(--mood-blue)",
  "var(--mood-longing)",
  "var(--mood-summer)",
  "var(--mood-fluorescent)",
];

export function GhostStratification({
  strata,
}: {
  strata: ForgottenStratum[];
}) {
  if (strata.length === 0) {
    return (
      <section id="ghosts" className="scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          songs you&apos;ve forgotten,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          ghosts
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          we couldn&apos;t find any forgotten songs in your library yet —
          either you&apos;re a new spotify user or you replay everything
          you&apos;ve ever liked.
        </p>
      </section>
    );
  }

  return (
    <section id="ghosts" className="scroll-mt-16 relative">
      {/* Decorative ghost glyph */}
      <span
        aria-hidden
        className="absolute -left-2 -top-4 text-6xl text-[var(--color-accent)] opacity-15 font-[family-name:var(--font-serif)] italic select-none"
      >
        ❉
      </span>

      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        songs you&apos;ve forgotten,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        ghosts, by the year you liked them
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-10 max-w-prose">
        which years of your life are you still playing, and which did you let
        go of? for each year you&apos;ve been on spotify, here&apos;s how many
        songs you liked then that aren&apos;t in any of your current top
        tracks anymore.
      </p>

      <ol className="space-y-10">
        {strata.map((s, idx) => {
          const color = yearColors[idx % yearColors.length];
          const lostPct = s.forgottenPct;
          return (
            <li key={s.year} className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
              {/* Big year number on the left, like a chapter number */}
              <span
                className="font-[family-name:var(--font-serif)] italic text-5xl sm:text-6xl leading-none tabular-nums select-none"
                style={{ color }}
              >
                {s.year}
              </span>

              <div>
                <p className="text-base text-[var(--color-text)] leading-snug mb-1">
                  <span className="font-[family-name:var(--font-serif)] italic text-xl">
                    {s.forgottenCount}
                  </span>{" "}
                  forgotten of{" "}
                  <span className="font-[family-name:var(--font-serif)] italic">
                    {s.totalLiked}
                  </span>{" "}
                  liked.{" "}
                  <span className="text-[var(--color-text-muted)]">
                    {lostPct}% drift.
                  </span>
                </p>

                {/* Visual bar showing forgotten ratio */}
                <div className="h-1 w-full bg-[var(--color-rule)] rounded-full overflow-hidden mb-3 max-w-xs">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${lostPct}%`, background: color }}
                  />
                </div>

                {s.sampleSongs.length > 0 && (
                  <ul className="text-sm text-[var(--color-text-muted)] space-y-0.5">
                    {s.sampleSongs.map((song) => (
                      <li key={song.id} className="leading-relaxed">
                        <span className="text-[var(--color-text)]">
                          {song.title}
                        </span>
                        <span className="text-[var(--color-text-faint)]">
                          {" "}
                          —{" "}
                        </span>
                        <span className="font-[family-name:var(--font-serif)] italic">
                          {song.artist}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
