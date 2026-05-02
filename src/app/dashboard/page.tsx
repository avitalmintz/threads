import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ErasSection } from "@/components/dashboard/ErasSection";
import { EraNav } from "@/components/dashboard/EraNav";
import { ForgottenThemesSection } from "@/components/dashboard/ForgottenThemesSection";
import { GhostStratification } from "@/components/dashboard/GhostStratification";
import { LateNight } from "@/components/dashboard/LateNight";
import { LibraryEntropy } from "@/components/dashboard/LibraryEntropy";
import { ResurrectionCard } from "@/components/dashboard/ResurrectionCard";
import { addForgottenMetricsToEras, analyzeLibrary } from "@/lib/analysis";
import { getAuthCookies } from "@/lib/auth";
import { getLibrarySnapshot } from "@/lib/spotify";

export default async function DashboardPage() {
  const auth = await getAuthCookies();
  if (!auth) redirect("/");

  let snapshot = null;
  let retryAfterSec: number | null = null;
  try {
    snapshot = await getLibrarySnapshot();
  } catch (err) {
    const ra = (err as Error & { retryAfterSec?: number }).retryAfterSec;
    if (typeof ra === "number") retryAfterSec = ra;
    else throw err;
  }
  if (!snapshot) return <RateLimitedScreen retryAfterSec={retryAfterSec} />;

  const { user } = snapshot;
  const analysis = analyzeLibrary(snapshot);
  const topAll = [
    ...snapshot.topShort,
    ...snapshot.topMedium,
    ...snapshot.topLong,
  ];

  // Eras with forgotten % filled in (synchronous, fast). Real lyric-derived
  // themes per era are streamed in via <ErasSection> + <Suspense> below.
  const erasWithMetrics = addForgottenMetricsToEras(
    analysis.eras,
    topAll,
    snapshot.likes,
    snapshot.playlistTrackIds ?? [],
  );

  const displayName = (user.display_name ?? user.id).toLowerCase();

  return (
    <main className="relative min-h-dvh px-6 py-12 sm:px-12 sm:py-16">
      <EraNav eras={erasWithMetrics} />
      <div className="mx-auto max-w-2xl">
        <header className="flex items-baseline justify-between mb-12 sm:mb-14">
          <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)]">
            ghosts —{" "}
            <span className="text-[var(--color-text-faint)]">{displayName}</span>
          </p>
          <a
            href="/api/auth/logout"
            className="text-xs italic font-[family-name:var(--font-serif)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            log out
          </a>
        </header>

        {/* Synchronous, renders immediately */}
        <LibraryEntropy entropy={analysis.entropy} />

        <Ornament />

        <div className="space-y-14 sm:space-y-16">
          <ResurrectionCard resurrection={analysis.resurrection} />
          <GhostStratification strata={analysis.forgottenByYear} />

          {/* Streamed via Suspense — lyrics + Claude take longer */}
          <Suspense
            fallback={<SectionLoading label="reading the lyrics of your forgotten library —" />}
          >
            <ForgottenThemesSection
              forgottenSongs={analysis.forgottenSongs}
            />
          </Suspense>

          <Suspense
            fallback={<SectionLoading label="reading themes per era —" />}
          >
            <ErasSection
              eras={analysis.eras}
              likes={snapshot.likes}
              topAll={topAll}
              playlistTrackIds={snapshot.playlistTrackIds ?? []}
            />
          </Suspense>

          <LateNight songs={analysis.forgottenLateNight} />
        </div>

        <footer className="mt-24 pt-8 border-t border-[var(--color-rule)] text-xs text-[var(--color-text-faint)] font-[family-name:var(--font-serif)] italic flex items-baseline justify-between flex-wrap gap-2">
          <span>
            est. 2026 · v0.1 · {analysis.totalLikes.toLocaleString()} liked
            songs analyzed
          </span>
          <span>playlist creation coming next</span>
        </footer>
      </div>
    </main>
  );
}

// Lightweight skeleton shown while async theme sections stream in.
function SectionLoading({ label }: { label: string }) {
  return (
    <div className="border-l-2 border-dashed border-[var(--color-rule-strong)] pl-5 py-4">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide animate-pulse">
        {label}
      </p>
    </div>
  );
}

function RateLimitedScreen({
  retryAfterSec,
}: {
  retryAfterSec: number | null;
}) {
  const isExtended = retryAfterSec !== null && retryAfterSec > 60;
  return (
    <main className="relative min-h-dvh px-6 py-16 sm:px-12 sm:py-24">
      <div className="mx-auto max-w-xl">
        <p className="font-[family-name:var(--font-serif)] italic text-base text-[var(--color-text-muted)] mb-12">
          ghosts
        </p>
        <h1 className="font-[family-name:var(--font-serif)] text-4xl sm:text-5xl italic leading-tight text-[var(--color-text)] mb-4">
          spotify is throttling us.
        </h1>
        <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-4 max-w-prose">
          you&apos;re logged in fine — but spotify&apos;s api rate-limiter
          blocked our request.
        </p>
        {retryAfterSec !== null && (
          <p className="text-base text-[var(--color-text)] leading-relaxed mb-4 max-w-prose">
            <span className="font-[family-name:var(--font-serif)] italic">
              spotify says: wait{" "}
            </span>
            <span className="font-[family-name:var(--font-serif)] italic text-2xl text-[var(--color-accent)]">
              {retryAfterSec}s
            </span>
          </p>
        )}
        {isExtended ? (
          <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
            that&apos;s an{" "}
            <span className="font-[family-name:var(--font-serif)] italic text-[var(--color-text)]">
              extended throttle
            </span>{" "}
            — wait it out, or register a new spotify dev app at
            developer.spotify.com to get fresh quota.
          </p>
        ) : (
          <p className="text-base text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-prose">
            wait at least the time spotify says above (and ideally double that
            to be safe), then refresh. once we get through once, your library
            caches for an hour and refreshes are instant.
          </p>
        )}
        <div className="flex gap-6 flex-wrap text-base">
          <a
            href="/dashboard"
            className="border-b border-[var(--color-text)] pb-1 text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            try again →
          </a>
          <a
            href="/api/auth/logout"
            className="border-b border-[var(--color-rule-strong)] pb-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors font-[family-name:var(--font-serif)] italic"
          >
            log out
          </a>
        </div>
      </div>
    </main>
  );
}

function Ornament() {
  return (
    <div
      aria-hidden
      className="my-16 sm:my-20 flex items-center justify-center gap-6 text-[var(--color-rule-strong)]"
    >
      <span className="h-px flex-1 max-w-[60px] bg-current" />
      <span className="font-[family-name:var(--font-serif)] italic text-2xl text-[var(--color-text-faint)] select-none">
        ❉
      </span>
      <span className="h-px flex-1 max-w-[60px] bg-current" />
    </div>
  );
}
