import type { ObsessionArc } from "@/lib/mock-data";

function ArcSparkline({ history }: { history: number[] }) {
  const w = 80;
  const h = 24;
  const max = Math.max(...history, 1);
  const points = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible opacity-70"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function CurrentObsessions({ arcs }: { arcs: ObsessionArc[] }) {
  return (
    <section>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl tracking-tight text-[var(--color-text)] mb-2">
        What&apos;s on rotation
      </h2>
      <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        Three songs you cannot stop playing right now. The line on the right
        traces their daily play count over the last fortnight.
      </p>

      <ol className="divide-y divide-[var(--color-rule)]">
        {arcs.map((arc, i) => (
          <li key={arc.song.id} className="flex items-baseline gap-6 py-4">
            <span className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-faint)] w-6 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-[family-name:var(--font-serif)] text-xl text-[var(--color-text)] leading-tight">
                {arc.song.title}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                {arc.song.artist}{" "}
                <span className="text-[var(--color-text-faint)]">·</span>{" "}
                <span className="font-[family-name:var(--font-serif)] italic">
                  {arc.song.recentPlays} plays in the last fortnight
                </span>
              </p>
            </div>
            <ArcSparkline history={arc.history} />
          </li>
        ))}
      </ol>
    </section>
  );
}
