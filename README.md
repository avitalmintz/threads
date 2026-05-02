# ghosts

a web app that watches your spotify and quietly remembers your obsessions. when you forget them, they come back.

## what it does (v0.1 → eventually)

- **Eras** (v0.1) — when you finish an obsession phase, an auto-generated playlist is born in your spotify, dated + named (e.g. `march 2026 · the rainy one`)
- **Ghosts** (v0.2) — rotating playlist of past obsessions you've fully forgotten
- **Sneaky daily mix** (v0.3) — daily playlist that weaves ghosts into your current rotation
- **On This Day** (v0.4) — what you were obsessed with 1yr / 2yr ago today

## stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (Postgres + auth)
- Vercel (hosting + cron)
- Spotify Web API

## first-time setup

### 1. Spotify app

1. Go to https://developer.spotify.com/dashboard and create an app
2. Set the Redirect URI to `http://localhost:3000/api/auth/spotify/callback`
3. Copy the Client ID and Client Secret

### 2. Supabase project

1. Create a project at https://supabase.com
2. From Settings → API, copy the Project URL, anon key, and service role key

### 3. Environment

```bash
cp .env.local.example .env.local
# fill in the values you just got
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## architecture notes

- **Logging strategy:** one nightly cron loops through all authorized users and pulls each one's `recently-played` from Spotify (last 50 tracks ≈ 24h of listening). Plus opportunistic refresh whenever a user opens the app. No per-user worker fleet.
- **Era detection:** when a song's 14-day rolling play count drops below X% of its peak, it "burns out" and gets bundled with sibling songs into a new Era playlist.
- **No historical play counts via API:** Spotify only exposes recent-play history, so all features improve over time as data accumulates.

## spotify quota note

New Spotify apps are capped at **25 authorized users** until you apply for a quota extension (manual review by Spotify). Plan to apply once v1 is polished.
