// Disk cache for the entire LibrarySnapshot. Keyed by a hash of the access token
// so logging in as a different user gets a fresh cache. TTL is intentionally
// generous (1 hour) so most refreshes are instant — Spotify rate-limits hard
// when we re-fetch hundreds of liked songs every load.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LibrarySnapshot,
  LikedTrack,
  PlayHistoryItem,
  SpotifyArtist,
  SpotifyTrack,
  SpotifyUser,
} from "./spotify";

const CACHE_DIR = join(process.cwd(), ".cache");
const TTL_MS = 60 * 60 * 1000; // 1 hour

function fileFor(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `snapshot-${hash}.json`);
}

type SerializedSnapshot = {
  cachedAt: number;
  user: SpotifyUser;
  likes: LikedTrack[];
  topShort: SpotifyTrack[];
  topMedium: SpotifyTrack[];
  topLong: SpotifyTrack[];
  recent: PlayHistoryItem[];
  artists: SpotifyArtist[];
  playlistTrackIds?: string[];
};

export async function readCachedSnapshot(
  token: string,
  options: { allowStale?: boolean } = {},
): Promise<LibrarySnapshot | null> {
  try {
    const text = await readFile(fileFor(token), "utf-8");
    const data = JSON.parse(text) as SerializedSnapshot;
    const isFresh = Date.now() - data.cachedAt < TTL_MS;
    if (!isFresh && !options.allowStale) return null;
    return {
      user: data.user,
      likes: data.likes,
      topShort: data.topShort,
      topMedium: data.topMedium,
      topLong: data.topLong,
      recent: data.recent,
      artistMap: new Map(data.artists.map((a) => [a.id, a])),
      playlistTrackIds: data.playlistTrackIds ?? [],
    };
  } catch {
    return null;
  }
}

export async function writeCachedSnapshot(
  token: string,
  snapshot: LibrarySnapshot,
): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const data: SerializedSnapshot = {
      cachedAt: Date.now(),
      user: snapshot.user,
      likes: snapshot.likes,
      topShort: snapshot.topShort,
      topMedium: snapshot.topMedium,
      topLong: snapshot.topLong,
      recent: snapshot.recent,
      artists: Array.from(snapshot.artistMap.values()),
      playlistTrackIds: snapshot.playlistTrackIds,
    };
    await writeFile(fileFor(token), JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to write snapshot cache:", err);
  }
}
