import type { DerivedEra } from "@/lib/analysis";

const palette = [
  "var(--mood-blue)",
  "var(--mood-fluorescent)",
  "var(--mood-longing)",
  "var(--mood-summer)",
];

function colorFor(idx: number): string {
  return palette[idx % palette.length];
}

export function Eras({ eras }: { eras: DerivedEra[] }) {
  if (eras.length === 0) {
    return (
      <section id="eras" className="scroll-mt-16">
        <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
          which clusters got abandoned,
        </p>
        <h2 className="font-[family-name:var(--font-serif)] text-3xl italic tracking-tight text-[var(--color-text)] mb-3">
          eras you let go of
        </h2>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed max-w-prose">
          we couldn&apos;t pull distinct eras from your liked-song history yet
          — your library is too sparse or too even.
        </p>
      </section>
    );
  }

  // Sort by % forgotten descending — most-abandoned eras first.
  const sorted = [...eras].sort(
    (a, b) => (b.forgottenPct ?? 0) - (a.forgottenPct ?? 0),
  );

  return (
    <section id="eras" className="scroll-mt-16">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        which clusters got abandoned,
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl sm:text-4xl italic tracking-tight text-[var(--color-text)] mb-3 leading-tight">
        eras you let go of
      </h2>
      <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-12 max-w-prose">
        each cluster of songs you fell for around the same time, ranked by how
        many of them you don&apos;t play anymore. the most-abandoned eras are
        on top.
      </p>

      <ol className="space-y-10">
        {sorted.map((era, idx) => {
          const color = colorFor(idx);
          const forgottenPct = era.forgottenPct ?? 0;
          const forgottenCount = era.forgottenCount ?? 0;
          return (
            <li
              key={era.id}
              id={`era-${era.id}`}
              className="border-l-2 pl-5 py-1 scroll-mt-16"
              style={{ borderColor: color }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h3 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] leading-tight">
                  {era.name}
                </h3>
                <span
                  className="font-[family-name:var(--font-serif)] italic text-base shrink-0 tabular-nums"
                  style={{ color }}
                >
                  {forgottenPct}% forgotten
                </span>
              </div>

              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                {forgottenCount} of {era.songs.length} songs no longer in
                rotation
              </p>

              {/* Forgotten ratio bar */}
              <div className="h-1 w-full bg-[var(--color-rule)] rounded-full overflow-hidden mb-4 max-w-xs">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${forgottenPct}%`, background: color }}
                />
              </div>

              {era.gist && <DropCapText text={era.gist} color={color} />}

              <ThemesBlock themes={era.themes} color={color} />

              <ol className="text-sm text-[var(--color-text-muted)] space-y-0.5 mt-3">
                {era.songs.slice(-4).reverse().map((s) => (
                  <li key={s.id} className="leading-relaxed">
                    <span className="text-[var(--color-text)]">{s.title}</span>
                    <span className="text-[var(--color-text-faint)]"> — </span>
                    <span className="font-[family-name:var(--font-serif)] italic">
                      {s.artist}
                    </span>
                  </li>
                ))}
                {era.songs.length > 4 && (
                  <li className="text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)]">
                    + {era.songs.length - 4} more
                  </li>
                )}
              </ol>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DropCapText({ text, color }: { text: string; color: string }) {
  if (!text) return null;
  return (
    <p className="text-base leading-relaxed text-[var(--color-text)] mb-3 max-w-prose">
      <span
        aria-hidden
        className="float-left mr-2 mt-1 font-[family-name:var(--font-serif)] italic leading-[0.85] text-4xl sm:text-5xl"
        style={{ color }}
      >
        {text[0]}
      </span>
      {text.slice(1)}
    </p>
  );
}

function ThemesBlock({
  themes,
  color,
}: {
  themes: string[] | undefined;
  color: string;
}) {
  if (!themes || themes.length === 0) return null;

  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer list-none text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--color-text)] transition-colors select-none inline-flex items-baseline gap-1">
        <span className="group-open:hidden">+ more detail</span>
        <span className="hidden group-open:inline">− less</span>
      </summary>
      <ul className="mt-2 flex items-baseline gap-x-1.5 gap-y-0.5 flex-wrap text-xs text-[var(--color-text-muted)]">
        {themes.map((t, i) => (
          <li key={t} className="font-[family-name:var(--font-serif)] italic">
            <span style={{ color }}>{t}</span>
            {i < themes.length - 1 && (
              <span className="text-[var(--color-text-faint)]"> ·</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
