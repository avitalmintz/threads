import type { Anniversary } from "@/lib/analysis";

function formatYearsAgo(years: number): string {
  if (years === 1) return "one year ago today";
  if (years === 2) return "two years ago today";
  if (years === 3) return "three years ago today";
  if (years === 4) return "four years ago today";
  return `${years} years ago today`;
}

function formatDate(date: Date): string {
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export function TodayCard({ anniversaries }: { anniversaries: Anniversary[] }) {
  const today = new Date();
  const todayLabel = formatDate(today);

  if (anniversaries.length === 0) {
    return (
      <section id="today" className="border-l-2 border-[var(--color-rule)] pl-5 py-2 scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-1">
          {todayLabel}.
        </p>
        <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] leading-relaxed">
          no like-anniversaries on today&apos;s date yet. come back next year,
          or in the meantime — keep liking songs.
        </p>
      </section>
    );
  }

  // Group by year
  const byYears = new Map<number, Anniversary[]>();
  for (const a of anniversaries) {
    if (!byYears.has(a.yearsAgo)) byYears.set(a.yearsAgo, []);
    byYears.get(a.yearsAgo)!.push(a);
  }

  return (
    <section
      id="today"
      className="relative border-l-2 pl-5 py-3 scroll-mt-16"
      style={{ borderColor: "var(--mood-summer)" }}
    >
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-1">
        {todayLabel}.
      </p>
      <h2 className="font-[family-name:var(--font-serif)] italic text-2xl text-[var(--color-text)] leading-tight mb-4">
        on this day, in years past —
      </h2>

      <ol className="space-y-5">
        {[...byYears.entries()].map(([years, songs]) => (
          <li key={years}>
            <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] mb-1">
              {formatYearsAgo(years)},
            </p>
            <ul className="space-y-0.5">
              {songs.slice(0, 3).map((a) => (
                <li
                  key={a.song.id}
                  className="text-base text-[var(--color-text)] leading-relaxed"
                >
                  you fell for{" "}
                  <span className="font-[family-name:var(--font-serif)] italic font-medium">
                    {a.song.title}
                  </span>{" "}
                  by {a.song.artist}.
                </li>
              ))}
              {songs.length > 3 && (
                <li className="text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)]">
                  + {songs.length - 3} more
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>

      <a
        href="#"
        className="mt-5 inline-block text-sm font-[family-name:var(--font-serif)] italic border-b pb-0.5 transition-colors hover:opacity-70"
        style={{ color: "var(--mood-summer)", borderColor: "var(--mood-summer)" }}
      >
        open today&apos;s anniversary playlist →
      </a>
    </section>
  );
}
