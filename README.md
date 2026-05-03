# threads

Ask Claude anything about your iMessage history. "Who do I fight with most?" "Who haven't I texted in 6 months?" "When did Sarah and I start drifting apart?" — type the question, and the model reaches into your actual archive to answer with quotes and dates.

It also generates per-contact AI summaries: how each person talks to you, the most striking lines from your history with them, and an opt-in deep read of every message you've ever exchanged synthesized into a single picture of the relationship.

Mac only. Your messages never leave your browser.

## Features

### Ask anything about your archive

A natural-language Q&A box at the top of the contact list. Type any question about your texts and Claude answers with specific dates and verbatim quotes. Examples that work well:

- "Who do I fight with most? What about?"
- "Who compliments me?"
- "Who haven't I texted in 6 months that I used to text every day?"
- "Who did I talk to most during the summer of 2024?"
- "Find every time someone said they loved me"

Under the hood: Claude has stats for every contact in your archive and three search tools (`search_messages`, `rank_contacts_in_range`, `get_contact_summary`). It decides which to call based on the question, those tools run **in your browser** against the in-memory copy of `chat.db`, and the results are sent back to Claude to synthesize an answer. The model never sees your full archive — only the slices it asks for.

### Per-contact AI insights

For any specific contact, you also get:

- **Their voice** — a 4–6 sentence AI summary of how this person communicates with you specifically. Their nicknames for you, recurring phrases, tone, what they typically text about. Quotes their actual phrasing.
- **Striking moments** — 3–5 editorial pull-quotes from your history with this person. The funny lines, the vulnerable ones, the turning points.
- **Deep dive** — opt-in full read of every 1:1 message you've ever exchanged. Chunked into time periods, summarized one period at a time, then synthesized into a single 5–8 sentence picture of how the relationship has evolved.
- **Scoped Q&A** — same ask box as the global one, but limited to messages with this person.

### At-a-glance stats

Under the AI features:

- Total messages, sender split, conversation span
- Activity sparkline (messages per month over the entire history)
- 7×24 heatmap of when the two of you text
- Texture stats: peak hour, peak day, longest streak, longest gap, median response time, who initiates more

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

**Browser-driven tool-use loop.** For the archive Q&A, Claude requests tools like `search_messages`, `rank_contacts_in_range`, and `get_contact_summary`. Those tools run in the browser against the in-memory `chat.db`, and the browser orchestrates each turn of the loop (up to 8 turns). The `/api/llm` proxy is intentionally stateless — it never has to read the user's data, and it can't be made to.

**1:1 vs group chat attribution.** Stats include both — a friend you mostly group-chat with should still rank. But AI message extraction uses 1:1 only, because group-chat messages they sent are addressed to whoever's in the group, not you. Including them confuses analyses like "what nicknames do they use for me".

**Stratified sampling.** For high-volume contacts, the per-contact AI samples messages spread evenly across the full history (using SQLite's `NTILE` window function), not just the most recent N. Otherwise the texture summary would bias toward the last few days.

**Cost control.** Per-IP rate limit (60 req/min token bucket), origin allowlist in production, and a hard `max_tokens` cap on the proxy. The real safety net is the Anthropic spend cap.
