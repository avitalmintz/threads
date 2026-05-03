# threads

A web app that reads your iMessage history and shows you your relationships over time. Heatmaps, message volume over time, AI summaries of how each person talks to you, pull-quotes from your history, and natural-language Q&A over the whole archive.

Mac only. Your data never leaves your browser.

## Features

**Contact list (`/threads`)**
- Every contact ranked by total messages
- For each: last seen, message range, and an activity label (active / quieter lately / fading / drifted / long quiet)
- Ask questions across the whole archive: "Who do I fight with most?", "Who haven't I texted in 6 months?", "Who compliments me?"

**Per-contact view (`/threads/[id]`)**
- Total messages, sender split, conversation span
- Activity sparkline (messages per month)
- 7×24 heatmap of when you two text
- Texture stats: peak hour, peak day, longest streak, longest gap, median response time, who initiates more
- *Their voice* — AI summary of how this person communicates, written in 4–6 sentences
- *Striking moments* — 3–5 editorial pull-quotes from your history with this person
- *Deep dive* — opt-in full read of every 1:1 message you've exchanged, chunked and synthesized period by period
- A scoped Q&A box for asking about this conversation specifically

## Privacy

- `chat.db` is loaded into the **browser** via WebAssembly SQLite (sql.js). Every query runs locally.
- Your contacts (`AddressBook-v22.abcddb`) are loaded the same way and merged into a name map locally.
- Both files are persisted in **OPFS** (origin-private filesystem) so they survive page reloads, but they're scoped to this origin and never leave your machine.
- The only thing that goes to an LLM is short snippets of message text — and only when you ask a question or open a contact view.
- No accounts, no cloud sync, no analytics.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4
- sql.js (WebAssembly SQLite) for in-browser queries
- OPFS for persistent file storage in the browser
- IndexedDB for caching AI results
- Anthropic API (Claude Haiku 4.5) via a thin `/api/llm` server proxy that holds the API key and rate-limits per IP

## Local development

```bash
npm install
cp .env.local.example .env.local
# add THREADS_LLM_KEY=<your Anthropic API key>
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the onboarding flow. It walks you through copying `chat.db` and your AddressBook to `~/Desktop/threads-data/`, then uploading them via file pickers.

## Deploying to Vercel

1. Set a hard monthly spend cap on Anthropic ([console.anthropic.com](https://console.anthropic.com) → Settings → Limits)
2. Push this repo to GitHub
3. Go to [vercel.com/new](https://vercel.com/new), import the repo
4. Add `THREADS_LLM_KEY` as an environment variable
5. Deploy

The app is fully static plus one serverless route (`/api/llm`), so any Vercel tier works.

## Architecture notes

**1:1 vs group chat attribution.** Stats include both — a friend you mostly group-chat with should still rank. But AI message extraction uses 1:1 only, because group-chat messages they sent are addressed to whoever's in the group, not you. Including them confuses analyses like "what nicknames do they use for me".

**Stratified sampling.** For high-volume contacts, the per-contact AI samples messages spread evenly across the full history (using SQLite's `NTILE` window function), not just the most recent N. Otherwise the texture summary would bias toward the last few days.

**Browser-driven tool-use loop.** For the archive Q&A, Claude requests tools like `search_messages`, `rank_contacts_in_range`, and `get_contact_summary`. Those tools run in the browser against the in-memory `chat.db`, and the browser orchestrates each turn. The `/api/llm` proxy stays stateless — it never has to read the user's data.

**Cost control.** Per-IP rate limit (60 req/min token bucket), origin allowlist in production, and a hard `max_tokens` cap on the proxy. The real safety net is the Anthropic spend cap.
