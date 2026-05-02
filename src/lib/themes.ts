// Anthropic-powered theme extraction with disk cache.
// Sends a chunk of lyrics to Claude Haiku and asks for 3-5 specific,
// image-rich thematic preoccupations that recur across the songs.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), ".cache");
const THEMES_CACHE_FILE = join(CACHE_DIR, "themes.json");

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

export type EraReading = {
  // The gist: 1-2 short sentences. Mixes the main theme(s) with the overall
  // vibe (sound, mood, tempo). Always shown first — the "instant gist" line.
  gist: string;
  // Supporting bullet detail. Can be lyrical (specific phrases, named places)
  // OR vibe-based (slow tempo, acoustic guitar heavy, melancholy mood).
  themes: string[];
};

type ThemeCacheEntry = EraReading & {
  computedAt: number;
};

type ThemeCache = Record<string, ThemeCacheEntry>;

const EMPTY_READING: EraReading = { gist: "", themes: [] };

let memCache: ThemeCache | null = null;

async function loadCache(): Promise<ThemeCache> {
  if (memCache) return memCache;
  try {
    const text = await readFile(THEMES_CACHE_FILE, "utf-8");
    memCache = JSON.parse(text) as ThemeCache;
  } catch {
    memCache = {};
  }
  return memCache;
}

async function saveCache(cache: ThemeCache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(THEMES_CACHE_FILE, JSON.stringify(cache, null, 2));
    memCache = cache;
  } catch (err) {
    console.warn("Failed to save themes cache:", err);
  }
}

// Era hash = stable identifier for a set of songs. If the era's songs change,
// the hash changes and we recompute themes.
export function hashEraSongs(songIds: string[]): string {
  const sorted = [...songIds].sort().join(",");
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

const SYSTEM_PROMPT = `You are characterizing one era of someone's listening — the songs they fell in love with during a specific period. You read the FULL LYRICS and listen for the OVERALL VIBE (mood, tempo, genre/sound, intensity). You're a plain-spoken friend, not a poet.

Hard rules:
- NO metaphors. NO "X as Y" phrasings ("the body as a stranger" — BAD).
- NO second-person voice ("you were searching" — BAD).
- NO dramatic literary language ("haunted", "bodies fading", "the long blue hour" — BAD).
- NO mystical/poetic phrasing.
- DO be plain, observational, specific. "Slow indie folk." "Mostly breakup songs."
- DO mix LYRICAL content (what the lyrics say) AND VIBE (mood, sound, tempo, genre).

Output two fields:

1. **gist** — ONE or TWO sentences that capture the era's main theme + overall vibe. Tight, direct, immediately readable. Two sentences max — the user reads this FIRST and should "get it" instantly.
   - May be a single theme: "Slow melancholy indie folk, mostly about breakups."
   - May be two themes: "Half upbeat dance-pop about going out, half quiet acoustic ballads about being alone after."
   - Always combine WHAT the lyrics are about with HOW the songs feel (sound/mood).
   - GOOD: "Slow indie folk and acoustic ballads, mostly breakup songs with lyrics about specific cities and missing people."
   - GOOD: "Mid-tempo R&B about toxic relationships, melancholy and slow."
   - GOOD: "High-energy dance pop, lyrics mostly about going out and wanting to be seen."
   - BAD: "Songs about love." (too vague)
   - BAD: "Lyrics anchor on water imagery." (too narrow, ignores vibe)
   - BAD: "Haunted by empty rooms." (poetic)

2. **themes** — 3-5 short plain phrases for those who want more detail. Mix of LYRICAL observations AND VIBE descriptors. Lowercase, 2-8 words each. Direct quoted lyric fragments in single quotes are great.

   GOOD themes (mix of lyrical + vibe):
   Lyrical:
   - "lyrics name specific cities (Boston, LA, the desert)"
   - "songs addressed to someone who left"
   - "the line 'I'll call your mom' recurs"
   - "lyrics about not being able to sleep"
   Vibe:
   - "slow tempos, mostly under 90 bpm"
   - "heavy on acoustic guitar"
   - "quiet, almost-whispered vocals"
   - "melancholy mood throughout"
   - "anthemic chorus-driven pop"

   BAD themes:
   - "songs about love" (too generic)
   - "the body as a map of memory" (metaphor)
   - "summer as the last time we were alive" (poetic)

Output ONLY a JSON object with keys "gist" and "themes". No markdown fences, no surrounding prose.

Example:
{
  "gist": "Slow indie folk and acoustic ballads, mostly breakup songs with lyrics about specific cities (Boston, the desert) and missing people.",
  "themes": ["slow tempo, acoustic guitar heavy", "songs addressed to someone who left", "lyrics naming specific cities", "the line 'come home' recurring", "melancholy mood throughout"]
}`;

type AnthropicResponse = {
  content: { type: string; text: string }[];
};

// Per-track lyrics input. We label each chunk so the model can connect themes
// across songs explicitly.
export type LyricsForExtraction = {
  title: string;
  artist: string;
  lyrics: string;
};

function buildUserPrompt(
  songs: LyricsForExtraction[],
  contextLabel: string,
): string {
  const blocks = songs
    .map(
      (s) => `### ${s.title} — ${s.artist}\n${truncate(s.lyrics, 1200)}\n`,
    )
    .join("\n");
  return `Lyrics from songs in ${contextLabel}:\n\n${blocks}\n\nFind 3-5 specific recurring themes. Output JSON array only.`;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

function parseEraReading(raw: string): EraReading {
  // Be lenient: sometimes the model wraps JSON in markdown fences or adds prose.
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return EMPTY_READING;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_READING;
    const gist = typeof parsed.gist === "string" ? parsed.gist.trim() : "";
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes
          .filter((x: unknown): x is string => typeof x === "string")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
          .slice(0, 5)
      : [];
    return { gist, themes };
  } catch {
    return EMPTY_READING;
  }
}

async function callAnthropic(userPrompt: string): Promise<EraReading> {
  // Note: we use GHOSTS_LLM_KEY rather than the conventional ANTHROPIC_API_KEY
  // because some parent shells (e.g. Claude Code's CLI environment) export
  // ANTHROPIC_API_KEY="" which overrides anything in .env.local.
  const apiKey = process.env.GHOSTS_LLM_KEY;
  if (!apiKey) {
    console.warn("GHOSTS_LLM_KEY not set — skipping theme extraction");
    return EMPTY_READING;
  }

  const res = await fetch(ANTHROPIC_BASE, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
    return EMPTY_READING;
  }

  const json = (await res.json()) as AnthropicResponse;
  const text = json.content[0]?.text ?? "";
  const parsed = parseEraReading(text);
  if (parsed.themes.length === 0 && !parsed.gist) {
    console.warn(
      `[themes] empty parse. raw response: ${text.slice(0, 500)}`,
    );
  } else {
    console.log(
      `[themes] extracted: ${parsed.gist.slice(0, 100)}... (${parsed.themes.length} themes)`,
    );
  }
  return parsed;
}

// Extract reading + themes for a set of songs. Caches by stable hash of the song set.
// Returns an empty reading gracefully on any failure — the dashboard tolerates that.
export async function extractEraReading(
  cacheKey: string,
  songs: LyricsForExtraction[],
  contextLabel: string,
): Promise<EraReading> {
  if (songs.length === 0) return EMPTY_READING;

  const cache = await loadCache();
  const cached = cache[cacheKey];
  if (cached) return { gist: cached.gist, themes: cached.themes };

  // Cap at 10 songs per era to keep token cost reasonable.
  const sample = songs.slice(0, 10);

  const prompt = buildUserPrompt(sample, contextLabel);
  let result: EraReading = EMPTY_READING;
  try {
    result = await callAnthropic(prompt);
  } catch (err) {
    console.warn(`extractEraReading failed for ${cacheKey}:`, err);
    result = EMPTY_READING;
  }

  cache[cacheKey] = { ...result, computedAt: Date.now() };
  await saveCache(cache);
  return result;
}
