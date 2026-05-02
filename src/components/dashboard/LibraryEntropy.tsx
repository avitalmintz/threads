import type { LibraryEntropy as Entropy } from "@/lib/analysis";

// The hero of the dashboard. Honest framing about what we measure: songs you
// liked but Spotify isn't surfacing as top tracks AND aren't in your own
// playlists AND weren't liked recently. Spotify's API doesn't expose play
// counts, so this is the closest proxy we have for "songs you saved but
// aren't actively engaging with right now."
export function LibraryEntropy({ entropy }: { entropy: Entropy }) {
  if (entropy.totalLiked === 0) return null;

  return (
    <section id="entropy" className="scroll-mt-16 relative">
      <span
        aria-hidden
        className="absolute -left-3 -top-8 text-8xl text-[var(--color-accent)] opacity-15 font-[family-name:var(--font-serif)] italic select-none"
      >
        ❀
      </span>

      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        the shape of your library,
      </p>

      <h1 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-[1] tracking-tight text-[var(--color-text)] mb-5 mt-2">
        you&apos;ve liked{" "}
        <span className="text-[var(--color-accent)] tabular-nums">
          {entropy.totalLiked.toLocaleString()}
        </span>{" "}
        songs.
      </h1>

      <p className="font-[family-name:var(--font-serif)] italic text-xl sm:text-2xl text-[var(--color-text)] leading-snug max-w-xl mb-2">
        only{" "}
        <span className="not-italic font-[family-name:var(--font-geist-sans)] tabular-nums">
          {entropy.active.toLocaleString()}
        </span>{" "}
        are in heavy rotation.
      </p>

      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-6 max-w-prose">
        <span className="text-[var(--color-text-faint)]">
          (in your top tracks across short, medium, or long term — or in a
          playlist you made — or liked in the last month.)
        </span>
      </p>

      <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose mb-2">
        the other{" "}
        <span className="text-[var(--color-text)] font-medium tabular-nums">
          {entropy.dormant.toLocaleString()}
        </span>{" "}
        are saved but quiet — songs you liked once and don&apos;t currently
        elevate. spotify&apos;s api doesn&apos;t actually expose play counts,
        so we can&apos;t prove you never play them. but they&apos;re not what
        spotify is feeding back to you, and you haven&apos;t pulled them into
        a playlist.
      </p>
      <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text)] leading-relaxed max-w-prose">
        ghosts is for those songs.
      </p>

      {/* Two columns of era-level breakdown — asymmetric on desktop */}
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8 mt-12">
        {entropy.mostDormantEras.length > 0 && (
          <div>
            <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-3">
              eras you let go of most
            </p>
            <ul className="space-y-1.5">
              {entropy.mostDormantEras.map((e) => (
                <li
                  key={e.name}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-[var(--color-text)] truncate">
                    {e.name}
                  </span>
                  <span
                    className="font-[family-name:var(--font-serif)] italic tabular-nums shrink-0"
                    style={{ color: "var(--mood-longing)" }}
                  >
                    {100 - e.activePct}% quiet
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {entropy.mostActiveEras.length > 0 && (
          <div className="sm:translate-y-2">
            <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-3">
              eras still alive
            </p>
            <ul className="space-y-1.5">
              {entropy.mostActiveEras.map((e) => (
                <li
                  key={e.name}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-[var(--color-text)] truncate">
                    {e.name}
                  </span>
                  <span className="font-[family-name:var(--font-serif)] italic tabular-nums text-[var(--color-accent)] shrink-0">
                    {e.activePct}% kept
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
