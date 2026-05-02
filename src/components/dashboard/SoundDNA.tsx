import type { GenreEntry } from "@/lib/analysis";

export function SoundDNA({
  genres,
  totalLikes,
}: {
  genres: GenreEntry[];
  totalLikes: number;
}) {
  if (genres.length === 0) {
    return (
      <section>
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          your sound dna,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          a genre fingerprint
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          we don&apos;t have enough data yet to draw your fingerprint.
          come back after liking a few more songs.
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        your sound dna,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        a genre fingerprint
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        every artist on spotify is tagged with a handful of micro-genres. these
        are the threads that run through your library — the dominant patterns
        across all{" "}
        <span className="font-[family-name:var(--font-serif)] italic">
          {totalLikes.toLocaleString()} liked songs
        </span>
        .
      </p>

      <ol className="space-y-2">
        {genres.map((g, i) => (
          <li
            key={g.name}
            className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-3"
          >
            <span className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-[family-name:var(--font-serif)] italic text-lg text-[var(--color-text)]">
                  {g.name}
                </span>
                <span className="text-sm text-[var(--color-text-faint)] tabular-nums">
                  {g.count}
                </span>
              </div>
              <div className="mt-1 h-1 bg-[var(--color-rule)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${g.weight * 100}%`,
                    background: "var(--color-current-mood)",
                  }}
                />
              </div>
            </div>
            <span />
          </li>
        ))}
      </ol>
    </section>
  );
}
