import type { CurrentObsession, Reading } from "@/lib/analysis";

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function RightNow({
  reading,
  obsessions,
}: {
  reading: Reading;
  obsessions: CurrentObsession[];
}) {
  return (
    <section className="relative">
      <div
        className="absolute -inset-x-6 sm:-inset-x-12 -top-16 h-72 -z-10 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 0%, var(--current-mood-soft), transparent 75%)",
        }}
        aria-hidden
      />

      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-4">
        right now,
      </p>

      <h2 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-[1] tracking-tight text-[var(--color-text)] mb-5">
        you&apos;re in{" "}
        <span
          className="not-italic font-[family-name:var(--font-serif)]"
          style={{ color: "var(--current-mood)" }}
        >
          {reading.currentEraName}
        </span>
        .
      </h2>

      {reading.hasCurrentEra && (
        <p className="text-sm text-[var(--color-text-muted)] mb-8 flex items-center gap-2 flex-wrap">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: "var(--current-mood)" }}
            aria-hidden
          />
          <span className="font-[family-name:var(--font-serif)] italic">
            day {reading.daysSinceFirstLike} · {reading.currentEraSongCount} songs liked in this era
          </span>
        </p>
      )}

      <div className="space-y-5 max-w-prose">
        {reading.topGenresNow.length > 0 && (
          <p className="text-lg leading-relaxed text-[var(--color-text)]">
            the threads that run through it:{" "}
            {reading.topGenresNow.map((g, i) => (
              <span key={g}>
                <span className="mood-marker font-[family-name:var(--font-serif)] italic">
                  {g}
                </span>
                {i < reading.topGenresNow.length - 2
                  ? ", "
                  : i === reading.topGenresNow.length - 2
                  ? ", and "
                  : ""}
              </span>
            ))}
            .
          </p>
        )}

        {obsessions.length > 0 && (
          <p className="text-lg leading-relaxed text-[var(--color-text)]">
            you keep going back to{" "}
            {obsessions.map((o, i) => (
              <span key={o.id}>
                <span className="font-[family-name:var(--font-serif)] italic font-medium">
                  {o.title}
                </span>{" "}
                by {o.artist}
                {o.recentPlays > 0 && (
                  <span className="text-[var(--color-text-faint)]">
                    {" "}
                    ({o.recentPlays}× recently)
                  </span>
                )}
                {i < obsessions.length - 2
                  ? ", "
                  : i === obsessions.length - 2
                  ? ", and "
                  : "."}
              </span>
            ))}
          </p>
        )}

        {!reading.hasCurrentEra && (
          <p className="text-base text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)] pt-2">
            no clear era forming yet — you&apos;re between phases. liking more
            songs together will start defining the next one.
          </p>
        )}
      </div>
    </section>
  );
}
