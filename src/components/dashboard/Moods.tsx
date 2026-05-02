import type { Mood } from "@/lib/mock-data";

const moodCSSVar: Record<string, string> = {
  blue: "var(--mood-blue)",
  fluorescent: "var(--mood-fluorescent)",
  longing: "var(--mood-longing)",
  summer: "var(--mood-summer)",
};

const moodSoftCSSVar: Record<string, string> = {
  blue: "var(--mood-blue-soft)",
  fluorescent: "var(--mood-fluorescent-soft)",
  longing: "var(--mood-longing-soft)",
  summer: "var(--mood-summer-soft)",
};

export function Moods({ moods }: { moods: Mood[] }) {
  return (
    <section>
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        the vibes that follow you,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
        your moods
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
        clusters of songs that share a sound, regardless of when they came
        into your life. each becomes its own playlist in your spotify so you
        can drop into a vibe whenever.
      </p>

      <ul className="grid sm:grid-cols-2 gap-3">
        {moods.map((m) => {
          const color = moodCSSVar[m.name] ?? m.hue;
          const soft = moodSoftCSSVar[m.name] ?? "transparent";
          return (
            <li
              key={m.id}
              className="rounded-lg p-4 transition-transform hover:-translate-y-0.5"
              style={{ background: soft }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3
                  className="font-[family-name:var(--font-serif)] italic text-2xl leading-tight"
                  style={{ color }}
                >
                  {m.name}
                </h3>
                <span
                  className="size-3 rounded-full shrink-0 mt-1.5"
                  style={{ background: color }}
                  aria-hidden
                />
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                {m.songCount} songs ·{" "}
                <span className="font-[family-name:var(--font-serif)] italic">
                  across {m.eraCount} eras
                </span>
              </p>
              <a
                href="#"
                className="text-sm font-[family-name:var(--font-serif)] italic hover:opacity-70 transition-opacity"
                style={{ color }}
              >
                open the playlist →
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
