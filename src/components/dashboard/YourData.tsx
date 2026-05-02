// Tiny inline note that appears under the dashboard header.
// Just one line — what's coming next, in a friendly aside.

const milestones: { day: number; label: string; what: string }[] = [
  { day: 7, label: "Week 1", what: "real play logs accumulating; current obsessions get verified replay counts" },
  { day: 30, label: "Month 1", what: "first play-verified era forms; seeded entries flip to precise" },
  { day: 365, label: "Year 1", what: "on this day activates with real play data — or upload spotify history to skip the wait" },
];

export function YourData({ daysSinceSignup }: { daysSinceSignup: number }) {
  const next = milestones.find((m) => m.day > daysSinceSignup);
  if (!next) return null;
  const daysAway = next.day - daysSinceSignup;

  return (
    <p className="mt-6 text-sm text-[var(--color-text-muted)] font-[family-name:var(--font-serif)] italic leading-relaxed max-w-prose">
      day {daysSinceSignup + 1}.{" "}
      <span className="text-[var(--color-text-faint)]">
        — in {daysAway} days, {next.what.toLowerCase()}.
      </span>
    </p>
  );
}
