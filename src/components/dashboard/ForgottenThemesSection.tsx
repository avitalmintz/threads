// Async server component that runs Claude theme extraction on the forgotten
// library. Wrapped in <Suspense> so it streams in after the rest of the page.

import { ForgottenThemes } from "@/components/dashboard/ForgottenThemes";
import { extractForgottenThemes } from "@/lib/analysis";
import type { SpotifyTrack } from "@/lib/spotify";

export async function ForgottenThemesSection({
  forgottenSongs,
}: {
  forgottenSongs: SpotifyTrack[];
}) {
  const reading = await extractForgottenThemes(forgottenSongs);
  return <ForgottenThemes gist={reading.gist} themes={reading.themes} />;
}
