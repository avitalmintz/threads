import type { DataState } from "@/lib/mock-data";

const stateConfig: Record<DataState, { label: string; title: string }> = {
  seeded: {
    label: "seeded",
    title: "populated from your liked-song timestamps + audio features on first login",
  },
  fuzzy: {
    label: "fuzzy",
    title: "approximate — refines once daily play logs accumulate",
  },
  precise: {
    label: "precise",
    title: "verified by per-play timestamps from real listening logs",
  },
  locked: {
    label: "locked",
    title: "needs more data to unlock",
  },
};

export function StateBadge({ state }: { state: DataState }) {
  const cfg = stateConfig[state];
  return (
    <span
      title={cfg.title}
      className="font-[family-name:var(--font-serif)] italic text-xs text-[var(--color-text-faint)] cursor-help"
    >
      {cfg.label}
    </span>
  );
}
