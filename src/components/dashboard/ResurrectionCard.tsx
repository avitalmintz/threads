import type { Resurrection } from "@/lib/analysis";

function formatYearsAgo(years: number): string {
  if (years === 1) return "one year ago";
  if (years === 2) return "two years ago";
  if (years === 3) return "three years ago";
  if (years === 4) return "four years ago";
  if (years === 5) return "five years ago";
  return `${years} years ago`;
}

export function ResurrectionCard({
  resurrection,
}: {
  resurrection: Resurrection | null;
}) {
  if (!resurrection) {
    return (
      <section
        id="today"
        className="border-l-2 border-[var(--color-rule)] pl-5 py-3 scroll-mt-16"
      >
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-1">
          today&apos;s resurrection,
        </p>
        <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] leading-relaxed">
          nothing forgotten enough to surface yet. either your library is small
          or you actually replay everything you save.
        </p>
      </section>
    );
  }

  const dateObj = new Date(resurrection.likedAt);
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const dateStr = `${months[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;

  return (
    <section
      id="today"
      className="relative border-l-2 pl-5 py-3 scroll-mt-16"
      style={{ borderColor: "var(--mood-summer)" }}
    >
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-1">
        today&apos;s resurrection,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] italic text-2xl text-[var(--color-text)] leading-tight mb-4">
        a song you used to love.
      </h2>

      <p className="text-lg leading-relaxed text-[var(--color-text)] mb-3 max-w-prose">
        {resurrection.isAnniversary ? (
          <>
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-muted)]">
              {formatYearsAgo(resurrection.yearsAgo)} today,
            </span>{" "}
            you fell for{" "}
          </>
        ) : (
          <>
            you fell for{" "}
          </>
        )}
        <span className="font-[family-name:var(--font-serif)] italic font-medium">
          {resurrection.song.title}
        </span>{" "}
        by {resurrection.song.artist}
        {!resurrection.isAnniversary && (
          <>
            {" "}
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-muted)]">
              on {dateStr}
            </span>
          </>
        )}
        .{" "}
        <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-muted)]">
          you haven&apos;t played it since.
        </span>
      </p>

      <a
        href="#"
        className="text-sm font-[family-name:var(--font-serif)] italic border-b pb-0.5 transition-colors hover:opacity-70 inline-block mt-2"
        style={{
          color: "var(--mood-summer)",
          borderColor: "var(--mood-summer)",
        }}
      >
        add to your ghosts playlist →
      </a>
    </section>
  );
}
