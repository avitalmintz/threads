// Placeholder data for the mock dashboard.
// Will be replaced with real Spotify-derived data once auth is wired.

export type DataState = "seeded" | "fuzzy" | "precise" | "locked";

export type Song = {
  id: string;
  title: string;
  artist: string;
  recentPlays: number;
};

export type Era = {
  id: string;
  name: string;
  state: DataState;
  approxDate: string;
  songs: Song[];
  moodTag: string;
  themes: string[]; // lyrical themes derived from Genius API
};

export type Mood = {
  id: string;
  name: string;
  songCount: number;
  eraCount: number;
  hue: string;
};

export type GhostStats = {
  active: number;
  vault: number;
  rotationPct: number;
};

export type ObsessionArc = {
  song: Song;
  // 14 daily play counts (oldest -> newest)
  history: number[];
};

export const mockObsessions: ObsessionArc[] = [
  {
    song: { id: "s1", title: "the line", artist: "soft cells", recentPlays: 24 },
    history: [0, 0, 1, 2, 4, 6, 9, 12, 14, 18, 22, 23, 24, 24],
  },
  {
    song: { id: "s2", title: "mostly water", artist: "lana eclipse", recentPlays: 18 },
    history: [2, 3, 5, 8, 11, 13, 14, 15, 17, 18, 18, 17, 18, 18],
  },
  {
    song: { id: "s3", title: "garage door", artist: "ghost mall", recentPlays: 11 },
    history: [0, 0, 0, 1, 2, 3, 5, 7, 9, 10, 11, 11, 11, 11],
  },
];

export const mockEras: Era[] = [
  {
    id: "e1",
    name: "march 2026 · the rainy one",
    state: "seeded",
    approxDate: "mar 4 — mar 28, 2026",
    moodTag: "blue",
    themes: ["water", "late nights", "the body as a stranger"],
    songs: [
      { id: "es1", title: "lemon water", artist: "halfsleep", recentPlays: 0 },
      { id: "es2", title: "doorways", artist: "candle field", recentPlays: 0 },
      { id: "es3", title: "after pool", artist: "halfsleep", recentPlays: 0 },
      { id: "es4", title: "telepathy", artist: "yola moon", recentPlays: 0 },
      { id: "es5", title: "bus to elsewhere", artist: "softer self", recentPlays: 0 },
      { id: "es6", title: "blue room", artist: "candle field", recentPlays: 0 },
      { id: "es7", title: "the gulf", artist: "halfsleep", recentPlays: 0 },
    ],
  },
  {
    id: "e2",
    name: "summer 2025 · fluorescent",
    state: "seeded",
    approxDate: "jul — sep 2025",
    moodTag: "fluorescent",
    themes: ["the city at night", "youth as a costume", "wanting to be seen"],
    songs: [
      { id: "es8", title: "neon teeth", artist: "weekend tape", recentPlays: 0 },
      { id: "es9", title: "off-brand", artist: "weekend tape", recentPlays: 0 },
      { id: "es10", title: "swimsuit", artist: "very online", recentPlays: 0 },
      { id: "es11", title: "rainforest cafe", artist: "jpeg dream", recentPlays: 0 },
      { id: "es12", title: "y2k.midi", artist: "very online", recentPlays: 0 },
    ],
  },
  {
    id: "e3",
    name: "late 2024 · longing",
    state: "seeded",
    approxDate: "oct — dec 2024",
    moodTag: "longing",
    themes: ["distance", "rooms with no one in them", "phone calls"],
    songs: [
      { id: "es13", title: "porch song", artist: "ash & elder", recentPlays: 0 },
      { id: "es14", title: "the answering machine", artist: "ash & elder", recentPlays: 0 },
      { id: "es15", title: "soft fall", artist: "minor weather", recentPlays: 0 },
      { id: "es16", title: "pages", artist: "minor weather", recentPlays: 0 },
    ],
  },
];

export const mockMoods: Mood[] = [
  { id: "m1", name: "blue", songCount: 47, eraCount: 4, hue: "#5b8def" },
  { id: "m2", name: "fluorescent", songCount: 32, eraCount: 3, hue: "#00ff85" },
  { id: "m3", name: "longing", songCount: 18, eraCount: 2, hue: "#ff00ea" },
  { id: "m4", name: "summer", songCount: 28, eraCount: 3, hue: "#ffb347" },
];

export const mockGhostStats: GhostStats = {
  active: 30,
  vault: 247,
  rotationPct: 73,
};

export const mockUserProgress = {
  daysSinceSignup: 1,
  totalPlaysLogged: 47, // recently-played snapshot
};

// Recurring themes detected across the user's whole library, derived from Genius
// lyrics analysis. Not raw word counts — abstracted thematic patterns the user keeps
// returning to. Each theme links to a generated playlist.
export type Theme = {
  id: string;
  name: string;
  songCount: number;
  hue: string;
  exampleLyric: string;
  exampleSong: { title: string; artist: string };
};

export const mockThemes: Theme[] = [
  {
    id: "t1",
    name: "water",
    songCount: 38,
    hue: "#4a9bd6",
    exampleLyric: "i am made of mostly water / and the rest of me is yours",
    exampleSong: { title: "mostly water", artist: "lana eclipse" },
  },
  {
    id: "t2",
    name: "rooms with no one in them",
    songCount: 24,
    hue: "#b56891",
    exampleLyric: "the answering machine still says your name",
    exampleSong: { title: "the answering machine", artist: "ash & elder" },
  },
  {
    id: "t3",
    name: "the body as a stranger",
    songCount: 19,
    hue: "#5a8db5",
    exampleLyric: "i don't know whose hands these are anymore",
    exampleSong: { title: "the gulf", artist: "halfsleep" },
  },
  {
    id: "t4",
    name: "late nights, fluorescent",
    songCount: 31,
    hue: "#7ab040",
    exampleLyric: "the gas station sells me cigarettes at 3am like an old friend",
    exampleSong: { title: "neon teeth", artist: "weekend tape" },
  },
  {
    id: "t5",
    name: "asking to be remembered",
    songCount: 17,
    hue: "#d4823a",
    exampleLyric: "if you forget me, i forget myself",
    exampleSong: { title: "telepathy", artist: "yola moon" },
  },
];

// Synthesized "current state" reading shown at the top of the dashboard.
// In real life: derived from current obsessions + their audio features + their lyrics themes
// + matched against past eras for an echo. Not just stats — a short reading.
export const mockReading = {
  eraName: "a blue era",
  dayNumber: 18,
  startedDate: "March 12",
  songCount: 12,
  themes: ["water", "late nights", "the body as a stranger"],
  echoEra: {
    name: "December 2024",
    reason: "same blue mood, same pull toward water imagery",
  },
};
