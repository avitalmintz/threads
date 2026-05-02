import type { ProtoGhost } from "@/lib/analysis";

function formatTimeAgo(days: number): string {
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

export function ProtoGhosts({ ghosts }: { ghosts: ProtoGhost[] }) {
  if (ghosts.length === 0) {
    return (
      <section id="ghosts" className="scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          songs you&apos;ve forgotten,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          ghosts
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          no forgotten songs surfaced yet. either you have a small library, or
          you&apos;re uncommonly loyal to your old favorites.
        </p>
      </section>
    );
  }

  return (
    <section id="ghosts" className="scroll-mt-16">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        songs you&apos;ve forgotten,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        ghosts
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        songs you liked months or years ago that haven&apos;t made it into any of
        your current top tracks. forgotten loves, hovering. each week ghosts
        will rotate a fresh handful into a spotify playlist for you to
        re-encounter.
      </p>

      <ol className="space-y-2 mb-6">
        {ghosts.map((g) => (
          <li
            key={g.id}
            className="flex items-baseline gap-3 py-1.5 border-b border-[var(--color-rule)] last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <span className="text-base text-[var(--color-text)]">
                {g.title}
              </span>
              <span className="text-[var(--color-text-faint)]"> — </span>
              <span className="text-base text-[var(--color-text-muted)] font-[family-name:var(--font-serif)] italic">
                {g.artist}
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] whitespace-nowrap">
              liked {formatTimeAgo(g.daysSinceLiked)}
            </span>
          </li>
        ))}
      </ol>

      <a
        href="#"
        className="inline-block text-base font-[family-name:var(--font-serif)] italic border-b pb-1 transition-colors text-[var(--color-accent)] border-[var(--color-accent)] hover:opacity-70"
      >
        open the ghosts playlist →
      </a>
    </section>
  );
}
