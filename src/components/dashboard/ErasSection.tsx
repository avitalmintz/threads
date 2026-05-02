// Async server component that handles theme extraction for eras and renders.
// Wrapped in <Suspense> in the dashboard so the rest of the page can render
// before lyrics + Claude are done.

import { Eras } from "@/components/dashboard/Eras";
import {
  addForgottenMetricsToEras,
  enrichErasWithThemes,
  type DerivedEra,
} from "@/lib/analysis";
import type { LikedTrack, SpotifyTrack } from "@/lib/spotify";

export async function ErasSection({
  eras,
  likes,
  topAll,
  playlistTrackIds,
}: {
  eras: DerivedEra[];
  likes: LikedTrack[];
  topAll: SpotifyTrack[];
  playlistTrackIds: string[];
}) {
  const enriched = await enrichErasWithThemes(
    eras,
    likes,
    topAll,
    playlistTrackIds,
  );
  const withMetrics = addForgottenMetricsToEras(
    enriched,
    topAll,
    likes,
    playlistTrackIds,
  );
  return <Eras eras={withMetrics} />;
}
