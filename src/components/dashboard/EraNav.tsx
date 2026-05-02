"use client";

import type { DerivedEra } from "@/lib/analysis";

// Floating right-side TOC for jumping between eras. Hidden on screens narrower
// than ~1024px (would crowd the main column). Uses fragment links — the dashboard
// gives each era a stable id (era-${era.id}) anchor.

const sections = [
  { id: "entropy", label: "the dormant %" },
  { id: "today", label: "today's resurrection" },
  { id: "ghosts", label: "by the year" },
  { id: "forgotten-themes", label: "themes" },
  { id: "eras", label: "eras you let go of" },
  { id: "late-night", label: "3am ghosts" },
];

export function EraNav({ eras }: { eras: DerivedEra[] }) {
  return (
    <nav
      aria-label="Page navigation"
      className="hidden xl:block fixed right-6 top-1/2 -translate-y-1/2 z-10 max-h-[80vh] overflow-y-auto pr-2 w-44"
    >
      <ul className="space-y-1.5 text-xs">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors block py-0.5"
            >
              {s.label}
            </a>
          </li>
        ))}
        {eras.length > 0 && (
          <li className="pt-2">
            <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] mb-1">
              eras
            </p>
            <ul className="space-y-1 border-l border-[var(--color-rule)] pl-2">
              {eras.map((era) => (
                <li key={era.id}>
                  <a
                    href={`#era-${era.id}`}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors block py-0.5 leading-tight"
                  >
                    {era.name}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </nav>
  );
}
