// Computes derived dashboard data (eras, genre fingerprint, current obsessions, reading)
// from a raw Spotify library snapshot.

import type {
  LibrarySnapshot,
  LikedTrack,
  SpotifyArtist,
  SpotifyTrack,
} from "./spotify";
import { fetchLyricsBatch } from "./lyrics";
import {
  extractEraReading,
  hashEraSongs,
  type LyricsForExtraction,
} from "./themes";

export type DerivedEra = {
  id: string;
  name: string;
  approxDate: string;
  songCount: number;
  topGenres: string[];
  songs: { id: string; title: string; artist: string }[];
  // Lyrical reading: a tight 1-2 sentence "gist" mixing lyrics + vibe, plus
  // 3-5 supporting themes. Derived from LRCLIB lyrics + Claude.
  // Populated async after analyzeLibrary. Gist describes the FORGOTTEN songs
  // within this era, not the era as a whole.
  gist?: string;
  themes?: string[];
  // Forgotten metrics — how many of this era's songs you've abandoned.
  forgottenCount?: number;
  forgottenPct?: number;
  // Gap before this era — a quiet stretch between the previous era's end and
  // this era's start. Renders as a small "in between" entry in the timeline.
  gapBefore?: {
    start: Date;
    end: Date;
    days: number;
    songCount: number;
  };
  // Date range as Date objects for ordering
  start: Date;
  end: Date;
};

export type GenreEntry = {
  name: string;
  weight: number; // 0-1 normalized
  count: number;
};

export type CurrentObsession = {
  id: string;
  title: string;
  artist: string;
  recentPlays: number; // count in recently-played feed
};

export type Reading = {
  hasCurrentEra: boolean;
  currentEraName: string;
  daysSinceFirstLike: number; // for the current era
  currentEraSongCount: number;
  topGenresNow: string[];
  obsessions: CurrentObsession[];
};

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function formatMonth(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function isoMonth(date: string): string {
  return date.slice(0, 7); // "2026-03"
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function dominantGenres(
  tracks: SpotifyTrack[],
  artistMap: Map<string, SpotifyArtist>,
  topN = 3,
): string[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    for (const a of t.artists) {
      const artist = artistMap.get(a.id);
      if (!artist?.genres) continue;
      for (const g of artist.genres) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name);
}

// Cluster liked songs into eras. Approach:
// 1. Bucket likes by month.
// 2. Determine a threshold for "hot" months (above 1.0× average like count, or >=5).
// 3. Merge adjacent hot months into single eras.
// 4. Skip clusters under a minimum song count.
export function clusterEras(
  likes: LikedTrack[],
  artistMap: Map<string, SpotifyArtist>,
): DerivedEra[] {
  if (likes.length === 0) return [];

  const byMonth = new Map<string, LikedTrack[]>();
  for (const lt of likes) {
    const month = isoMonth(lt.added_at);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(lt);
  }

  const counts = [...byMonth.values()].map((v) => v.length);
  const avg = counts.reduce((s, n) => s + n, 0) / counts.length;
  const threshold = Math.max(5, Math.ceil(avg));

  const monthsSorted = [...byMonth.keys()].sort();
  const eras: DerivedEra[] = [];
  let current: { months: string[]; tracks: LikedTrack[] } | null = null;

  function flush() {
    if (!current) return;
    const tracks = current.tracks;
    if (tracks.length < 5) {
      current = null;
      return;
    }
    const sorted = [...tracks].sort((a, b) =>
      a.added_at.localeCompare(b.added_at),
    );
    const start = new Date(sorted[0].added_at);
    const end = new Date(sorted[sorted.length - 1].added_at);
    const startMonth = formatMonth(start);
    const endMonth = formatMonth(end);
    const range =
      startMonth === endMonth ? startMonth : `${startMonth} → ${endMonth}`;

    const topGenres = dominantGenres(
      tracks.map((t) => t.track),
      artistMap,
    );

    eras.push({
      id: `era-${current.months[0]}-${current.months.at(-1)}`,
      name: range,
      approxDate: range,
      songCount: tracks.length,
      topGenres,
      songs: tracks.map((t) => ({
        id: t.track.id,
        title: t.track.name,
        artist: t.track.artists[0]?.name ?? "—",
      })),
      start,
      end,
    });
    current = null;
  }

  for (let i = 0; i < monthsSorted.length; i++) {
    const month = monthsSorted[i];
    const tracks = byMonth.get(month)!;
    const isHot = tracks.length >= threshold;

    if (isHot) {
      const prev = current?.months.at(-1);
      const adjacent = prev && nextMonth(prev) === month;
      if (current && adjacent) {
        current.months.push(month);
        current.tracks.push(...tracks);
      } else {
        flush();
        current = { months: [month], tracks: [...tracks] };
      }
    } else {
      flush();
    }
  }
  flush();

  // Most recent first
  return eras.reverse();
}

export function computeGenreFingerprint(
  likes: LikedTrack[],
  artistMap: Map<string, SpotifyArtist>,
  topN = 10,
): GenreEntry[] {
  const counts = new Map<string, number>();
  for (const lt of likes) {
    for (const a of lt.track.artists) {
      const artist = artistMap.get(a.id);
      if (!artist?.genres) continue;
      for (const g of artist.genres) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return [];

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([name, count]) => ({
    name,
    count,
    weight: count / max,
  }));
}

export function selectCurrentObsessions(
  topShort: SpotifyTrack[],
  recent: { track: SpotifyTrack }[],
  limit = 3,
): CurrentObsession[] {
  return topShort.slice(0, limit).map((track) => {
    const recentPlays = recent.filter((p) => p.track.id === track.id).length;
    return {
      id: track.id,
      title: track.name,
      artist: track.artists.map((a) => a.name).join(", "),
      recentPlays,
    };
  });
}

export function buildReading(
  snapshot: LibrarySnapshot,
  eras: DerivedEra[],
  obsessions: CurrentObsession[],
): Reading {
  // The "current era" is the most recent era IF it ended within the last 60 days.
  const now = new Date();
  const recentEra = eras[0];
  const hasCurrentEra =
    !!recentEra &&
    (now.getTime() - recentEra.end.getTime()) / (1000 * 60 * 60 * 24) <= 60;

  if (hasCurrentEra && recentEra) {
    const days = Math.max(
      1,
      Math.floor(
        (now.getTime() - recentEra.start.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    return {
      hasCurrentEra: true,
      currentEraName: recentEra.name,
      daysSinceFirstLike: days,
      currentEraSongCount: recentEra.songCount,
      topGenresNow: recentEra.topGenres,
      obsessions,
    };
  }

  // Otherwise: the user is between eras. Use top genres from recently-played as a fallback.
  const recentTracks = snapshot.recent.map((p) => p.track);
  const topGenres = dominantGenres(recentTracks, snapshot.artistMap);
  return {
    hasCurrentEra: false,
    currentEraName: "between eras",
    daysSinceFirstLike: 0,
    currentEraSongCount: 0,
    topGenresNow: topGenres,
    obsessions,
  };
}

// === Day-1 features that don't need play history ===

export type Anniversary = {
  song: { id: string; title: string; artist: string };
  likedAt: string; // ISO
  yearsAgo: number;
};

export type ProtoGhost = {
  id: string;
  title: string;
  artist: string;
  likedAt: string;
  daysSinceLiked: number;
};

export type LateNightSong = {
  id: string;
  title: string;
  artist: string;
  likedAt: string;
  hour: number; // 0-23 in user's local interpretation (Spotify gives UTC)
};

export type ForgottenStratum = {
  year: number;
  totalLiked: number;
  forgottenCount: number;
  forgottenPct: number;
  sampleSongs: { id: string; title: string; artist: string; likedAt: string }[];
};

export type LibraryEntropy = {
  totalLiked: number;
  active: number;
  dormant: number;
  activePct: number;
  dormantPct: number;
  // Era-level breakdown — top 3 most-active and most-dormant eras
  mostActiveEras: { name: string; activePct: number; total: number }[];
  mostDormantEras: { name: string; activePct: number; total: number }[];
};

// One specific forgotten song surfaced freshly — ideally an anniversary that
// is ALSO forgotten ("3 years ago today you fell for X. you haven't played
// it since."). Falls back to a random old forgotten song if no anniversaries.
export type Resurrection = {
  song: { id: string; title: string; artist: string };
  likedAt: string;
  yearsAgo: number;
  isAnniversary: boolean;
};

// Songs liked on this exact month/day in past years.
export function findAnniversaries(
  likes: LikedTrack[],
  now: Date = new Date(),
): Anniversary[] {
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const thisYear = now.getFullYear();

  const matches: Anniversary[] = [];
  for (const lt of likes) {
    const d = new Date(lt.added_at);
    if (d.getMonth() !== todayMonth) continue;
    if (d.getDate() !== todayDate) continue;
    const yearsAgo = thisYear - d.getFullYear();
    if (yearsAgo < 1) continue; // skip likes from this year
    matches.push({
      song: {
        id: lt.track.id,
        title: lt.track.name,
        artist: lt.track.artists.map((a) => a.name).join(", "),
      },
      likedAt: lt.added_at,
      yearsAgo,
    });
  }
  // Sort: most years ago first (older = more poignant)
  return matches.sort((a, b) => b.yearsAgo - a.yearsAgo);
}

// Songs liked 6+ months ago that don't show up in any current top-tracks list
// (short/medium/long term). These are forgotten favorites — proto-ghosts.
export function findProtoGhosts(
  likes: LikedTrack[],
  topTracks: SpotifyTrack[],
  now: Date = new Date(),
  minDays = 180,
  limit = 8,
): ProtoGhost[] {
  const topIds = new Set(topTracks.map((t) => t.id));
  const cutoff = now.getTime() - minDays * 24 * 60 * 60 * 1000;

  const candidates: ProtoGhost[] = [];
  for (const lt of likes) {
    const ts = new Date(lt.added_at).getTime();
    if (ts > cutoff) continue;
    if (topIds.has(lt.track.id)) continue;
    candidates.push({
      id: lt.track.id,
      title: lt.track.name,
      artist: lt.track.artists.map((a) => a.name).join(", "),
      likedAt: lt.added_at,
      daysSinceLiked: Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24)),
    });
  }
  // Most distant first — the more forgotten, the more poignant
  candidates.sort((a, b) => b.daysSinceLiked - a.daysSinceLiked);
  return candidates.slice(0, limit);
}

// "Active" = appears in any of the user's three top-track lists, OR is in a
// user-owned playlist (strong "I curated this" signal), OR was liked in the
// last 30 days. Everything else in the liked library is "outside the active
// rotation" — not necessarily unplayed (Spotify's API doesn't expose play
// counts), but not surfaced as a top track and not curated into a playlist.
function buildActiveSet(
  likes: LikedTrack[],
  topAll: SpotifyTrack[],
  playlistTrackIds: string[] = [],
  now: Date = new Date(),
): Set<string> {
  const active = new Set(topAll.map((t) => t.id));
  for (const id of playlistTrackIds) active.add(id);
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const lt of likes) {
    if (new Date(lt.added_at).getTime() > cutoff) active.add(lt.track.id);
  }
  return active;
}

// Group forgotten songs by the year they were liked. For each year, show how
// many were liked total and how many of those have since gone dormant.
export function findForgottenByYear(
  likes: LikedTrack[],
  topAll: SpotifyTrack[],
  playlistTrackIds: string[] = [],
  now: Date = new Date(),
): ForgottenStratum[] {
  const active = buildActiveSet(likes, topAll, playlistTrackIds, now);

  type YearBucket = {
    total: number;
    forgotten: LikedTrack[];
  };
  const byYear = new Map<number, YearBucket>();
  for (const lt of likes) {
    const year = new Date(lt.added_at).getFullYear();
    if (!byYear.has(year)) byYear.set(year, { total: 0, forgotten: [] });
    const bucket = byYear.get(year)!;
    bucket.total++;
    if (!active.has(lt.track.id)) bucket.forgotten.push(lt);
  }

  const strata: ForgottenStratum[] = [];
  for (const [year, b] of byYear.entries()) {
    if (b.total < 3) continue; // skip very small years
    const sampleSongs = b.forgotten
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
      .map((lt) => ({
        id: lt.track.id,
        title: lt.track.name,
        artist: lt.track.artists.map((a) => a.name).join(", "),
        likedAt: lt.added_at,
      }));
    strata.push({
      year,
      totalLiked: b.total,
      forgottenCount: b.forgotten.length,
      forgottenPct: Math.round((b.forgotten.length / b.total) * 100),
      sampleSongs,
    });
  }
  return strata.sort((a, b) => b.year - a.year);
}

// Compute the active/dormant split across the whole liked library, plus
// per-era active rates so we can show "most active" and "most dormant" eras.
export function computeLibraryEntropy(
  likes: LikedTrack[],
  topAll: SpotifyTrack[],
  eras: DerivedEra[],
  playlistTrackIds: string[] = [],
  now: Date = new Date(),
): LibraryEntropy {
  const active = buildActiveSet(likes, topAll, playlistTrackIds, now);
  const total = likes.length;
  const activeCount = likes.filter((lt) => active.has(lt.track.id)).length;
  const dormant = total - activeCount;

  const eraStats = eras
    .map((e) => {
      const total = e.songs.length;
      if (total === 0) return null;
      const a = e.songs.filter((s) => active.has(s.id)).length;
      return {
        name: e.name,
        activePct: Math.round((a / total) * 100),
        total,
      };
    })
    .filter((s): s is { name: string; activePct: number; total: number } => s !== null)
    .filter((s) => s.total >= 5);

  const mostActive = [...eraStats]
    .sort((a, b) => b.activePct - a.activePct)
    .slice(0, 3);
  const mostDormant = [...eraStats]
    .sort((a, b) => a.activePct - b.activePct)
    .slice(0, 3);

  return {
    totalLiked: total,
    active: activeCount,
    dormant,
    activePct: total === 0 ? 0 : Math.round((activeCount / total) * 100),
    dormantPct: total === 0 ? 0 : Math.round((dormant / total) * 100),
    mostActiveEras: mostActive,
    mostDormantEras: mostDormant,
  };
}

// Pick today's "resurrection" — one specific forgotten song to surface. Prefers
// songs liked on this exact date in past years (anniversary + forgotten = most
// poignant). Falls back to any old forgotten song.
export function findResurrection(
  likes: LikedTrack[],
  topAll: SpotifyTrack[],
  playlistTrackIds: string[] = [],
  now: Date = new Date(),
): Resurrection | null {
  const active = buildActiveSet(likes, topAll, playlistTrackIds, now);

  // First try anniversaries (likes on today's month/day in past years) that
  // are ALSO forgotten — best of both worlds.
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();
  const anniversaries: Resurrection[] = [];
  for (const lt of likes) {
    if (active.has(lt.track.id)) continue;
    const d = new Date(lt.added_at);
    if (d.getMonth() !== todayMonth || d.getDate() !== todayDate) continue;
    const yearsAgo = now.getFullYear() - d.getFullYear();
    if (yearsAgo < 1) continue;
    anniversaries.push({
      song: {
        id: lt.track.id,
        title: lt.track.name,
        artist: lt.track.artists.map((a) => a.name).join(", "),
      },
      likedAt: lt.added_at,
      yearsAgo,
      isAnniversary: true,
    });
  }
  if (anniversaries.length > 0) {
    // Pick the one most years ago — most distant = most poignant.
    return anniversaries.sort((a, b) => b.yearsAgo - a.yearsAgo)[0];
  }

  // No anniversaries today — pick a random old forgotten song.
  // Stable per-day: hash today's date so the "random" pick is the same for
  // the whole day.
  const cutoffMs = 180 * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - cutoffMs;
  const candidates = likes.filter((lt) => {
    if (active.has(lt.track.id)) return false;
    return new Date(lt.added_at).getTime() < cutoff;
  });
  if (candidates.length === 0) return null;
  const dayKey =
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const idx = dayKey % candidates.length;
  const lt = candidates[idx];
  const yearsAgo =
    now.getFullYear() - new Date(lt.added_at).getFullYear();
  return {
    song: {
      id: lt.track.id,
      title: lt.track.name,
      artist: lt.track.artists.map((a) => a.name).join(", "),
    },
    likedAt: lt.added_at,
    yearsAgo,
    isAnniversary: false,
  };
}

// Songs liked between 1am-5am (UTC, since that's what Spotify gives us).
// Will be slightly off for users in non-UTC timezones — refinement later.
export function findLateNightSongs(
  likes: LikedTrack[],
  limit = 8,
): LateNightSong[] {
  const matches: LateNightSong[] = [];
  for (const lt of likes) {
    const d = new Date(lt.added_at);
    const hour = d.getUTCHours();
    if (hour >= 1 && hour <= 5) {
      matches.push({
        id: lt.track.id,
        title: lt.track.name,
        artist: lt.track.artists.map((a) => a.name).join(", "),
        likedAt: lt.added_at,
        hour,
      });
    }
  }
  // Most recent first
  matches.sort((a, b) => b.likedAt.localeCompare(a.likedAt));
  return matches.slice(0, limit);
}

export type AnalyzedDashboard = {
  eras: DerivedEra[];
  totalLikes: number;
  resurrection: Resurrection | null;
  forgottenByYear: ForgottenStratum[];
  entropy: LibraryEntropy;
  forgottenLateNight: LateNightSong[];
  // Sample of forgotten songs for theme extraction
  forgottenSongs: SpotifyTrack[];
};

export function analyzeLibrary(snapshot: LibrarySnapshot): AnalyzedDashboard {
  const eras = clusterEras(snapshot.likes, snapshot.artistMap);

  // Combined top tracks across all 3 horizons for "active" detection.
  const topAll = [
    ...snapshot.topShort,
    ...snapshot.topMedium,
    ...snapshot.topLong,
  ];
  const playlistIds = snapshot.playlistTrackIds ?? [];
  const active = buildActiveSet(snapshot.likes, topAll, playlistIds);

  const resurrection = findResurrection(snapshot.likes, topAll, playlistIds);
  const forgottenByYear = findForgottenByYear(
    snapshot.likes,
    topAll,
    playlistIds,
  );
  const entropy = computeLibraryEntropy(
    snapshot.likes,
    topAll,
    eras,
    playlistIds,
  );
  const lateNight = findLateNightSongs(snapshot.likes);

  // Filter late-night to only the forgotten ones — sharper cut.
  const forgottenLateNight = lateNight.filter((s) => !active.has(s.id));

  // Sample of forgotten songs (oldest first) for theme extraction.
  const forgottenSongs = snapshot.likes
    .filter((lt) => !active.has(lt.track.id))
    .sort((a, b) => a.added_at.localeCompare(b.added_at))
    .slice(0, 25)
    .map((lt) => lt.track);

  return {
    eras,
    totalLikes: snapshot.likes.length,
    resurrection,
    forgottenByYear,
    entropy,
    forgottenLateNight,
    forgottenSongs,
  };
}

// Annotate each era with the % of its songs that are no longer in any of the
// user's top tracks (forgotten). Used to sort eras by abandonment in the new
// hard-pivoted dashboard.
export function addForgottenMetricsToEras(
  eras: DerivedEra[],
  topAll: SpotifyTrack[],
  likes: LikedTrack[],
  playlistTrackIds: string[] = [],
  now: Date = new Date(),
): DerivedEra[] {
  const active = buildActiveSet(likes, topAll, playlistTrackIds, now);
  return eras.map((era) => {
    const forgotten = era.songs.filter((s) => !active.has(s.id)).length;
    return {
      ...era,
      forgottenCount: forgotten,
      forgottenPct: era.songs.length === 0
        ? 0
        : Math.round((forgotten / era.songs.length) * 100),
    };
  });
}

// Compute the "in-between" gap entries — the time between consecutive eras
// where the user kept liking songs but not enough to form a cluster. Returns
// the eras with `gapBefore` populated where applicable.
export function addGapsToEras(
  eras: DerivedEra[],
  likes: LikedTrack[],
): DerivedEra[] {
  return eras.map((era, i) => {
    // eras are reverse-chronological: i+1 is the older neighbor.
    const olderEra = eras[i + 1];
    if (!olderEra) return era;

    const gapStart = olderEra.end;
    const gapEnd = era.start;
    const gapMs = gapEnd.getTime() - gapStart.getTime();
    const gapDays = Math.floor(gapMs / (1000 * 60 * 60 * 24));
    if (gapDays < 30) return era; // too short to call a gap

    let songCount = 0;
    for (const lt of likes) {
      const ts = new Date(lt.added_at).getTime();
      if (ts > gapStart.getTime() && ts < gapEnd.getTime()) songCount++;
    }

    return {
      ...era,
      gapBefore: {
        start: gapStart,
        end: gapEnd,
        days: gapDays,
        songCount,
      },
    };
  });
}

// For each era, fetch lyrics for the FORGOTTEN songs in it (those no longer in
// any top tracks) and extract themes from those specifically. The new framing
// is "what kind of forgotten songs did you abandon from this era" — not "what
// is this era about." Results cache to disk by song-set hash.
export async function enrichErasWithThemes(
  eras: DerivedEra[],
  likes: LikedTrack[],
  topAll: SpotifyTrack[] = [],
  playlistTrackIds: string[] = [],
): Promise<DerivedEra[]> {
  const trackById = new Map<string, SpotifyTrack>();
  for (const lt of likes) trackById.set(lt.track.id, lt.track);
  const active = buildActiveSet(likes, topAll, playlistTrackIds);

  const enriched = await Promise.all(
    eras.map(async (era) => {
      // Use only the FORGOTTEN songs from the era. If none are forgotten, skip.
      const idsByDate = era.songs.map((s) => s.id);
      const fullTracks = idsByDate
        .map((id) => trackById.get(id))
        .filter((t): t is SpotifyTrack => t != null)
        .filter((t) => !active.has(t.id))
        .slice(-10);

      if (fullTracks.length === 0) {
        return { ...era, gist: "", themes: [] };
      }

      const lyricsByTrack = await fetchLyricsBatch(fullTracks);

      const songsWithLyrics: LyricsForExtraction[] = [];
      for (const t of fullTracks) {
        const ly = lyricsByTrack.get(t.id);
        if (ly) {
          songsWithLyrics.push({
            title: t.name,
            artist: t.artists[0]?.name ?? "",
            lyrics: ly,
          });
        }
      }

      if (songsWithLyrics.length === 0) {
        return { ...era, gist: "", themes: [] };
      }

      const cacheKey = hashEraSongs(songsWithLyrics.map((s) => `${s.title}|${s.artist}`));
      const reading = await extractEraReading(cacheKey, songsWithLyrics, era.name);
      return { ...era, gist: reading.gist, themes: reading.themes };
    }),
  );
  return enriched;
}

// Extract themes across a sample of the user's forgotten songs as a single
// group. Answers: "what do my forgotten loves have in common?" Uses the same
// extraction prompt + caching as eras.
export async function extractForgottenThemes(
  forgottenSongs: SpotifyTrack[],
): Promise<{ gist: string; themes: string[] }> {
  if (forgottenSongs.length === 0) return { gist: "", themes: [] };

  const sample = forgottenSongs.slice(0, 12);
  const lyricsByTrack = await fetchLyricsBatch(sample);

  const songsWithLyrics: LyricsForExtraction[] = [];
  for (const t of sample) {
    const ly = lyricsByTrack.get(t.id);
    if (ly) {
      songsWithLyrics.push({
        title: t.name,
        artist: t.artists[0]?.name ?? "",
        lyrics: ly,
      });
    }
  }

  if (songsWithLyrics.length === 0) return { gist: "", themes: [] };

  const cacheKey =
    "forgotten-" +
    hashEraSongs(songsWithLyrics.map((s) => `${s.title}|${s.artist}`));
  const reading = await extractEraReading(
    cacheKey,
    songsWithLyrics,
    "your forgotten library — songs you liked once and don't play anymore",
  );
  return { gist: reading.gist, themes: reading.themes };
}
