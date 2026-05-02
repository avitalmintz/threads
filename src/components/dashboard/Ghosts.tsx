import type { GhostStats } from "@/lib/mock-data";

export function Ghosts({ stats }: { stats: GhostStats }) {
  return (
    <section>
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        and the ones you forgot,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        your ghosts
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-6 max-w-prose">
        songs you used to love and stopped playing for at least four months.
        they wait in a vault until ghosts pulls a fresh handful into a spotify
        playlist each week.
      </p>

      <p className="text-lg leading-relaxed text-[var(--color-text)] mb-6 max-w-prose">
        <span className="font-[family-name:var(--font-serif)] italic text-3xl text-[var(--color-accent)]">
          {stats.vault}
        </span>{" "}
        songs in your vault.{" "}
        <span className="font-[family-name:var(--font-serif)] italic">
          {stats.active} are out on the table this week.
        </span>{" "}
        re-loving one pulls it out of the vault and starts a new arc.
      </p>

      <div className="flex gap-6 flex-wrap text-base">
        <a
          href="#"
          className="border-b border-[var(--color-text)] pb-1 text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
        >
          open the playlist →
        </a>
        <a
          href="#"
          className="border-b border-[var(--color-rule-strong)] pb-1 text-[var(--color-text-muted)] hover:border-[var(--color-text)] hover:text-[var(--color-text)] transition-colors font-[family-name:var(--font-serif)] italic"
        >
          browse the vault →
        </a>
      </div>
    </section>
  );
}
