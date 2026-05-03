// Shared type — chat-db (server) and browser-db (client) export the same shape.
import type { TextureStats } from "@/lib/browser-db";

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const FULL_DAY_LABELS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatGapDate(d: Date | null): string {
  if (!d) return "—";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function Heatmap({ heatmap }: { heatmap: number[][] }) {
  // Find max for color scaling
  let max = 0;
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) if (heatmap[d][h] > max) max = heatmap[d][h];
  if (max === 0) return null;

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        {/* Hour labels along top */}
        <div className="grid grid-cols-[3rem_repeat(24,1fr)] gap-px text-[9px] text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic mb-1">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center">
              {h % 4 === 0 ? formatHour(h) : ""}
            </span>
          ))}
        </div>
        {/* Each day row */}
        {DAY_LABELS.map((day, d) => (
          <div
            key={day}
            className="grid grid-cols-[3rem_repeat(24,1fr)] gap-px items-center mb-px"
          >
            <span className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] text-right pr-2">
              {day}
            </span>
            {heatmap[d].map((count, h) => {
              const intensity = count / max;
              const bg =
                count === 0
                  ? "var(--color-rule)"
                  : `color-mix(in srgb, var(--color-accent) ${Math.round(intensity * 100)}%, transparent)`;
              return (
                <div
                  key={h}
                  title={`${FULL_DAY_LABELS[d]} ${formatHour(h)}: ${count} messages`}
                  className="aspect-square rounded-sm min-w-[10px]"
                  style={{ background: bg }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TextureBlock({
  stats,
  displayName,
}: {
  stats: TextureStats;
  displayName: string;
}) {
  const totalInitiations = stats.initiationsByMe + stats.initiationsByThem;
  const myInitiationPct =
    totalInitiations > 0
      ? Math.round((stats.initiationsByMe / totalInitiations) * 100)
      : 0;

  return (
    <section className="mb-14">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        the rhythm,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-4 leading-tight">
        when + how you two talk
      </h2>

      <div className="mb-8 max-w-prose">
        <Heatmap heatmap={stats.heatmap} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 text-sm">
        <Stat
          label="peak hour"
          value={formatHour(stats.peakHour)}
          sub={`${stats.peakHourCount.toLocaleString()} msgs at this hour`}
        />
        <Stat
          label="peak day"
          value={DAY_LABELS[stats.peakDay]}
          sub={`${stats.peakDayCount.toLocaleString()} msgs on ${FULL_DAY_LABELS[stats.peakDay]}s`}
        />
        <Stat
          label="median reply time"
          value={formatResponseTime(stats.medianResponseSeconds)}
          sub="when one of you texts back"
        />
        <Stat
          label="who starts more"
          value={
            totalInitiations === 0
              ? "—"
              : myInitiationPct >= 60
                ? "you"
                : myInitiationPct <= 40
                  ? displayName.split(" ")[0].toLowerCase()
                  : "even"
          }
          sub={`${myInitiationPct}% you / ${100 - myInitiationPct}% them (after 6h+ silences)`}
        />
        <Stat
          label="longest streak"
          value={`${stats.longestStreakDays} days`}
          sub="consecutive days you both texted"
        />
        <Stat
          label="longest silence"
          value={`${stats.longestGapDays} days`}
          sub={
            stats.longestGapStart && stats.longestGapEnd
              ? `${formatGapDate(stats.longestGapStart)} → ${formatGapDate(stats.longestGapEnd)}`
              : ""
          }
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="font-[family-name:var(--font-serif)] italic text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
        {label}
      </p>
      <p className="font-[family-name:var(--font-serif)] italic text-xl text-[var(--color-text)] leading-tight">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">
          {sub}
        </p>
      )}
    </div>
  );
}
