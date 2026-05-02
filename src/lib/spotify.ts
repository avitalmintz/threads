// Spotify Web API client + OAuth helpers.
// Server-only — never import this from a Client Component.

import {
  getAuthCookies,
  updateAccessTokenCookies,
  clearAuthCookies,
} from "./auth";
import { readCachedSnapshot, writeCachedSnapshot } from "./snapshot-cache";

const AUTH_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-top-read",
  "user-read-recently-played",
  "playlist-modify-private",
  "playlist-modify-public",
].join(" ");

function getEnv() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Spotify env vars. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI in .env.local",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getEnv();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const { clientId, clientSecret, redirectUri } = getEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${AUTH_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }
  const json: TokenResponse = await res.json();
  if (!json.refresh_token) {
    throw new Error("Spotify did not return a refresh token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const { clientId, clientSecret } = getEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${AUTH_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${text}`);
  }
  const json: TokenResponse = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

// Returns a valid access token, refreshing it if needed. Returns null if the user
// isn't authenticated.
async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getAuthCookies();
  if (!tokens) return null;

  // Refresh if it expires within 60 seconds.
  if (tokens.expiresAt - Date.now() < 60_000) {
    try {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      await updateAccessTokenCookies(refreshed);
      return refreshed.accessToken;
    } catch {
      await clearAuthCookies();
      return null;
    }
  }
  return tokens.accessToken;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function spotifyFetch<T>(
  path: string,
  init?: RequestInit,
  attempt = 0,
): Promise<T | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    await clearAuthCookies();
    return null;
  }

  // Rate limited. We respect Retry-After honestly: if it's reasonable (<10s)
  // we wait and retry once. If it's longer, we fail fast and surface the wait
  // time — retrying too early would just re-trigger the throttle and extend it.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "5");
    console.warn(`Spotify 429 on ${path} — Retry-After: ${retryAfter}s`);
    if (retryAfter <= 10 && attempt < 1) {
      await sleep(retryAfter * 1000);
      return spotifyFetch<T>(path, init, attempt + 1);
    }
    const err = new Error(
      `Spotify API ${path} failed: 429 retry-after=${retryAfter}`,
    );
    (err as Error & { retryAfterSec?: number }).retryAfterSec = retryAfter;
    throw err;
  }

  // Spotify sometimes returns 403 when an app has been temporarily throttled.
  // Retry once after a longer delay.
  if (res.status === 403 && attempt < 1) {
    await sleep(3000);
    return spotifyFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export type SpotifyUser = {
  id: string;
  display_name: string | null;
  email?: string;
  images?: { url: string; height: number | null; width: number | null }[];
  country?: string;
  product?: string;
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres?: string[];
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: { id: string; name: string; release_date?: string };
  duration_ms: number;
  popularity?: number;
};

export type LikedTrack = {
  added_at: string; // ISO timestamp
  track: SpotifyTrack;
};

export type PlayHistoryItem = {
  played_at: string; // ISO timestamp
  track: SpotifyTrack;
};

type Paged<T> = {
  items: T[];
  total: number;
  next: string | null;
  limit: number;
  offset: number;
};

export async function getCurrentUser(): Promise<SpotifyUser | null> {
  return spotifyFetch<SpotifyUser>("/me");
}

// Pull liked songs in parallel batches. Spotify caps at 50 per page and 10000
// liked songs total. We fetch the first page to learn the total, then fan out
// the remaining pages in batches of 5 in parallel. ~5x faster than fully
// sequential, while staying under Spotify's rate limit (~180/min) by spacing
// the batches.
const MAX_LIKED = 10000;
const LIKED_BATCH = 5;

export async function getAllLikedTracks(): Promise<LikedTrack[]> {
  const first = await spotifyFetch<Paged<LikedTrack>>(
    "/me/tracks?limit=50&offset=0",
  );
  if (!first) return [];
  const items = [...first.items];
  const totalToFetch = Math.min(first.total, MAX_LIKED);

  const offsets: number[] = [];
  for (let o = 50; o < totalToFetch; o += 50) offsets.push(o);

  for (let i = 0; i < offsets.length; i += LIKED_BATCH) {
    const batch = offsets.slice(i, i + LIKED_BATCH);
    const pages = await Promise.all(
      batch.map((offset) =>
        spotifyFetch<Paged<LikedTrack>>(
          `/me/tracks?limit=50&offset=${offset}`,
        ).catch(() => null),
      ),
    );
    for (const p of pages) if (p) items.push(...p.items);
    // Light delay between batches to stay polite
    if (i + LIKED_BATCH < offsets.length) await sleep(150);
  }
  return items;
}

export async function getTopTracks(
  timeRange: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 50,
): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch<Paged<SpotifyTrack>>(
    `/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
  );
  return res?.items ?? [];
}

export async function getRecentlyPlayed(
  limit = 50,
): Promise<PlayHistoryItem[]> {
  const res = await spotifyFetch<{ items: PlayHistoryItem[] }>(
    `/me/player/recently-played?limit=${limit}`,
  );
  return res?.items ?? [];
}

// Get all track IDs that appear in playlists the user OWNS (not just follows).
// Songs in your own playlists are clearly active. Caps at first 50 owned
// playlists to keep the cost reasonable; for typical users that captures
// ~all of their playlist activity.
const PLAYLIST_BATCH = 4;
const MAX_OWNED_PLAYLISTS = 50;

export async function getOwnedPlaylistTrackIds(
  userId: string,
): Promise<string[]> {
  type PL = { id: string; owner: { id: string }; tracks: { total: number } };
  type PlItem = { track: { id: string } | null };

  // Fetch user's playlists (paginated)
  const owned: PL[] = [];
  let offset = 0;
  while (offset < 200 && owned.length < MAX_OWNED_PLAYLISTS) {
    const res = await spotifyFetch<Paged<PL>>(
      `/me/playlists?limit=50&offset=${offset}`,
    ).catch(() => null);
    if (!res || res.items.length === 0) break;
    for (const p of res.items) {
      if (p.owner.id === userId) owned.push(p);
      if (owned.length >= MAX_OWNED_PLAYLISTS) break;
    }
    if (res.items.length < 50) break;
    offset += 50;
  }
  if (owned.length === 0) return [];

  // For each owned playlist, fetch up to 100 track IDs (most playlists are smaller).
  // Run in batches of 4 in parallel.
  const allIds = new Set<string>();
  for (let i = 0; i < owned.length; i += PLAYLIST_BATCH) {
    const batch = owned.slice(i, i + PLAYLIST_BATCH);
    const results = await Promise.all(
      batch.map((p) =>
        spotifyFetch<Paged<PlItem>>(
          `/playlists/${p.id}/tracks?limit=100&fields=items(track(id)),total,limit,offset`,
        ).catch(() => null),
      ),
    );
    for (const r of results) {
      if (!r) continue;
      for (const item of r.items) {
        if (item.track?.id) allIds.add(item.track.id);
      }
    }
    if (i + PLAYLIST_BATCH < owned.length) await sleep(150);
  }

  return Array.from(allIds);
}

// Spotify accepts up to 50 artist IDs per call. We fan out chunks 4 at a time
// in parallel with a light delay between batches — faster than fully
// sequential while staying inside Spotify's rate limit window.
// Returns whatever we successfully got — partial data is fine.
const ARTIST_BATCH = 4;

export async function getArtistsByIds(
  ids: string[],
): Promise<SpotifyArtist[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  const all: SpotifyArtist[] = [];
  for (let i = 0; i < chunks.length; i += ARTIST_BATCH) {
    const batch = chunks.slice(i, i + ARTIST_BATCH);
    const results = await Promise.all(
      batch.map((chunk) =>
        spotifyFetch<{ artists: SpotifyArtist[] }>(
          `/artists?ids=${chunk.join(",")}`,
        ).catch((err) => {
          console.warn("getArtistsByIds chunk failed:", err);
          return null;
        }),
      ),
    );
    for (const r of results) if (r) all.push(...r.artists);
    if (i + ARTIST_BATCH < chunks.length) await sleep(200);
  }
  return all;
}

export type LibrarySnapshot = {
  user: SpotifyUser;
  likes: LikedTrack[];
  topShort: SpotifyTrack[];
  topMedium: SpotifyTrack[];
  topLong: SpotifyTrack[];
  recent: PlayHistoryItem[];
  artistMap: Map<string, SpotifyArtist>;
  // Track IDs that appear in any user-owned playlist. Strong "active" signal —
  // if you put a song in a playlist you made, you're engaged with it.
  playlistTrackIds: string[];
};

// One-shot fetch of everything we need for the dashboard.
// Tries the disk cache first (1h TTL) so we don't re-hit Spotify on every refresh —
// hammering Spotify with hundreds of API calls per page load gets us rate-limited.
// Resilient: any non-critical failure returns partial data instead of throwing.
export async function getLibrarySnapshot(): Promise<LibrarySnapshot | null> {
  const auth = await getAuthCookies();
  if (!auth) return null;

  // Fast path: read from cache.
  const cached = await readCachedSnapshot(auth.accessToken);
  if (cached) return cached;

  let user: SpotifyUser | null = null;
  let rateLimitedRetryAfter: number | null = null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    console.warn("getCurrentUser failed:", err);
    const ra = (err as Error & { retryAfterSec?: number }).retryAfterSec;
    if (typeof ra === "number") rateLimitedRetryAfter = ra;
  }

  if (!user) {
    // Fall back to a stale cache rather than logging the user out — Spotify's
    // rate limiter is the most likely cause of /me failing.
    const stale = await readCachedSnapshot(auth.accessToken, { allowStale: true });
    if (stale) return stale;
    if (rateLimitedRetryAfter !== null) {
      const err = new Error(
        `Rate limited. Spotify says wait ${rateLimitedRetryAfter}s.`,
      );
      (err as Error & { retryAfterSec?: number }).retryAfterSec =
        rateLimitedRetryAfter;
      throw err;
    }
    return null;
  }

  // Fetch top tracks (3 time ranges) + recently played in parallel — small calls, fine.
  // Then liked songs sequentially so we don't hammer the rate limit.
  const [topShort, topMedium, topLong, recent] = await Promise.all([
    getTopTracks("short_term", 50).catch((err) => {
      console.warn("getTopTracks short failed:", err);
      return [] as SpotifyTrack[];
    }),
    getTopTracks("medium_term", 50).catch((err) => {
      console.warn("getTopTracks medium failed:", err);
      return [] as SpotifyTrack[];
    }),
    getTopTracks("long_term", 50).catch((err) => {
      console.warn("getTopTracks long failed:", err);
      return [] as SpotifyTrack[];
    }),
    getRecentlyPlayed(50).catch((err) => {
      console.warn("getRecentlyPlayed failed:", err);
      return [] as PlayHistoryItem[];
    }),
  ]);

  let likes: LikedTrack[] = [];
  let playlistTrackIds: string[] = [];
  try {
    [likes, playlistTrackIds] = await Promise.all([
      getAllLikedTracks(),
      getOwnedPlaylistTrackIds(user.id).catch((err) => {
        console.warn("getOwnedPlaylistTrackIds failed:", err);
        return [] as string[];
      }),
    ]);
  } catch (err) {
    console.warn("getAllLikedTracks failed:", err);
  }

  const artistIds = new Set<string>();
  for (const lt of likes) for (const a of lt.track.artists) artistIds.add(a.id);
  for (const t of topShort) for (const a of t.artists) artistIds.add(a.id);
  for (const t of topMedium) for (const a of t.artists) artistIds.add(a.id);
  for (const t of topLong) for (const a of t.artists) artistIds.add(a.id);
  for (const p of recent) for (const a of p.track.artists) artistIds.add(a.id);

  const artists = await getArtistsByIds(Array.from(artistIds));
  const artistMap = new Map(artists.map((a) => [a.id, a]));

  const snapshot: LibrarySnapshot = {
    user,
    likes,
    topShort,
    topMedium,
    topLong,
    recent,
    artistMap,
    playlistTrackIds,
  };
  await writeCachedSnapshot(auth.accessToken, snapshot);
  return snapshot;
}
