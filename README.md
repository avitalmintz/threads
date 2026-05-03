# threads

A web app that lets you ask Claude natural-language questions about your iMessage history and surfaces AI-generated insights about each of your relationships. Mac only. Your messages never leave your browser.

## Features

- **Natural-language Q&A over your full archive.** Ask anything about your texts and Claude answers with specific dates and verbatim quotes. The model is given aggregate stats for every contact and a set of search tools; it decides what to look up, those lookups run in your browser against the in-memory `chat.db`, and the results are sent back for synthesis. Claude never sees your full archive — only the slices it asks for.
- **Per-contact "their voice" summary.** A short AI write-up of how this specific person communicates with you: their nicknames for you, recurring phrases, tone, what they typically text about. Quotes their actual phrasing.
- **Striking moments.** AI-selected pull-quotes from your history with a contact — the funny lines, the vulnerable ones, the turning points.
- **Deep dive.** Opt-in full read of every 1:1 message you've ever exchanged with a contact. Chunked into time periods, summarized period by period, then synthesized into a single picture of how the relationship has evolved.
- **Scoped Q&A.** The same ask box, limited to messages with one specific person.
- **Per-contact stats.** Total messages, sender split, conversation span, an activity sparkline, a 7×24 heatmap of when you text, and texture stats (peak hour, peak day, longest streak, longest gap, median response time, who initiates more).

## Privacy

- `chat.db` is loaded into the browser via WebAssembly SQLite (sql.js). Every query runs locally.
- AddressBook (`AddressBook-v22.abcddb`) is loaded the same way and merged into a name map locally.
- Both files are persisted in OPFS (origin-private filesystem). They survive page reloads but are scoped to this origin and never leave your machine.
- The only thing sent to the LLM is short snippets of message text, and only when you ask a question or open a contact view.
- No accounts, no cloud sync, no analytics.

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript, Tailwind v4
- sql.js (WebAssembly SQLite)
- OPFS for persistent in-browser file storage
- IndexedDB for caching AI results
- Anthropic API (Claude Haiku 4.5) via a thin server-side proxy at `/api/llm`

## Local development

```bash
npm install
cp .env.local.example .env.local
# add THREADS_LLM_KEY=<your Anthropic API key>
npm run dev
```

Open `http://localhost:3000` and follow the onboarding flow. It walks you through copying `chat.db` and your AddressBook into `~/Desktop/threads-data/`, then uploading them through file pickers in the browser.

## Deployment

1. Set a monthly spend cap on Anthropic (`console.anthropic.com` → Settings → Limits).
2. Push this repo to GitHub.
3. Go to `vercel.com/new` and import the repo.
4. Add `THREADS_LLM_KEY` as an environment variable.
5. Deploy.

The app is fully static plus one serverless route (`/api/llm`), so any Vercel tier works.

## How it works

**Browser-driven tool-use loop.** For Q&A, Claude is given three tools — `search_messages`, `rank_contacts_in_range`, and `get_contact_summary`. The browser receives Claude's tool calls, runs them locally against the in-memory `chat.db`, and sends the results back. The browser orchestrates the entire loop (up to 8 turns). The server-side `/api/llm` proxy is stateless and never reads user data.

**1:1 vs group chat attribution.** Stats include both. A friend you mostly group-chat with should still rank. But AI message extraction uses 1:1 only, because group-chat messages they sent are addressed to whoever's in the group, not you. Including them confuses analyses like "what nicknames do they use for me".

**Stratified sampling.** For high-volume contacts, the per-contact AI samples messages spread evenly across the full history using SQLite's `NTILE` window function, not just the most recent N. Otherwise the texture summary biases toward the last few days.

**Cost control.** Per-IP rate limit (60 req/min token bucket), origin allowlist in production, hard `max_tokens` cap on the proxy. The real safety net is the Anthropic spend cap.
