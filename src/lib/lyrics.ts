// LRCLIB lyrics fetcher with disk cache.
// LRCLIB matches by artist + track + (album, duration) — strict enough that
// we don't risk grabbing a different song with the same title.
// https://lrclib.net/docs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SpotifyTrack } from "./spotify";

const CACHE_DIR = join(process.cwd(), ".cache");
const LYRICS_CACHE_FILE = join(CACHE_DIR, "lyrics.json");

type LyricsCacheEntry = {
  trackId: string;
  found: boolean;
  lyrics: string | null;
  fetchedAt: number;
};

type LyricsCache = Record<string, LyricsCacheEntry>;

// In-memory cache mirror — avoids re-reading the file on every request.
let memCache: LyricsCache | null = null;

async function loadCache(): Promise<LyricsCache> {
  if (memCache) return memCache;
  try {
    const text = await readFile(LYRICS_CACHE_FILE, "utf-8");
    memCache = JSON.parse(text) as LyricsCache;
  } catch {
    memCache = {};
  }
  return memCache;
}

async function saveCache(cache: LyricsCache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(LYRICS_CACHE_FILE, JSON.stringify(cache, null, 2));
    memCache = cache;
  } catch (err) {
    console.warn("Failed to save lyrics cache:", err);
  }
}

type LRCLIBResult = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

async function lrclibGet(
  artist: string,
  track: string,
  album: string | null,
  durationSec: number | null,
): Promise<LRCLIBResult | null> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  if (album) params.set("album_name", album);
  if (durationSec) params.set("duration", String(durationSec));

  try {
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "ghosts (https://github.com/local)" },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`LRCLIB ${res.status}: ${artist} - ${track}`);
      return null;
    }
    return (await res.json()) as LRCLIBResult;
  } catch (err) {
    console.warn(`LRCLIB fetch failed for ${artist} - ${track}:`, err);
    return null;
  }
}

// Fetch lyrics for a Spotify track. Tries an exact match first (artist + track
// + album + duration), then loosens to artist + track. Caches by Spotify track
// ID so we never re-fetch.
export async function fetchLyrics(track: SpotifyTrack): Promise<string | null> {
  const cache = await loadCache();
  const cached = cache[track.id];
  if (cached) return cached.lyrics;

  const artist = track.artists[0]?.name ?? "";
  const title = track.name;
  const album = track.album.name ?? null;
  const durationSec = Math.round((track.duration_ms ?? 0) / 1000);

  // Strict: artist + track + album + duration
  let result = await lrclibGet(artist, title, album, durationSec || null);

  // Looser: artist + track only
  if (!result) {
    result = await lrclibGet(artist, title, null, null);
  }

  let lyrics: string | null = null;
  if (result && result.plainLyrics && !result.instrumental) {
    lyrics = result.plainLyrics;
  }

  cache[track.id] = {
    trackId: track.id,
    found: lyrics !== null,
    lyrics,
    fetchedAt: Date.now(),
  };
  await saveCache(cache);
  return lyrics;
}

// Fetch lyrics for many tracks. Uses parallel batches of 6 — LRCLIB is more
// permissive than Spotify, and most lookups end up being cache hits anyway
// so the requests are cheap. ~6x faster than sequential on cold caches.
const LYRICS_BATCH = 6;

export async function fetchLyricsBatch(
  tracks: SpotifyTrack[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < tracks.length; i += LYRICS_BATCH) {
    const batch = tracks.slice(i, i + LYRICS_BATCH);
    const results = await Promise.all(batch.map((t) => fetchLyrics(t)));
    results.forEach((lyrics, idx) => {
      if (lyrics) result.set(batch[idx].id, lyrics);
    });
  }
  return result;
}
