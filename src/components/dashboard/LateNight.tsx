import type { LateNightSong } from "@/lib/analysis";

export function LateNight({ songs }: { songs: LateNightSong[] }) {
  if (songs.length === 0) {
    return (
      <section id="late-night" className="scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          a niche cut,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          forgotten 3am loves
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          you don&apos;t seem to like songs late at night, or you still play
          all the ones you do. either way — no forgotten 3am cluster yet.
        </p>
      </section>
    );
  }

  return (
    <section id="late-night" className="scroll-mt-16">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        a niche cut,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        forgotten 3am loves
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        songs you liked between 1am and 5am — the more emotional, private
        ones. these are also no longer in any of your top tracks. the part of
        your taste you let in only after midnight, then let go of.
      </p>

      <ol className="space-y-2 mb-6">
        {songs.map((s) => (
          <li
            key={s.id}
            className="flex items-baseline gap-3 py-1.5 border-b border-[var(--color-rule)] last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <span className="text-base text-[var(--color-text)]">{s.title}</span>
              <span className="text-[var(--color-text-faint)]"> — </span>
              <span className="text-base text-[var(--color-text-muted)] font-[family-name:var(--font-serif)] italic">
                {s.artist}
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] whitespace-nowrap tabular-nums">
              {String(s.hour).padStart(2, "0")}:xx
            </span>
          </li>
        ))}
      </ol>

      <a
        href="#"
        className="inline-block text-base font-[family-name:var(--font-serif)] italic border-b pb-1 transition-colors hover:opacity-70"
        style={{
          color: "var(--mood-longing)",
          borderColor: "var(--mood-longing)",
        }}
      >
        open the 3am ghosts playlist →
      </a>
    </section>
  );
}
