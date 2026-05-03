# threads

a quiet read through every iMessage you've ever sent. heatmaps, arcs, the way each person talks to you, the moments that stand out, AI Q&A. nothing leaves your machine.

mac-only (reads `chat.db` from Messages.app). public-deployable on Vercel.

## what it does

- **all-people view** — every contact ranked by message volume, with last-seen, span, and an "active / quieter / drifting / long quiet" label
- **per-contact** —
  - stats (totals, span)
  - activity sparkline (messages per month over the entire history)
  - 7×24 heatmap + texture stats (peak hour, peak day, longest streak, longest gap, median response time, who initiates more)
  - **their voice** — AI summary of how this person communicates (4–6 sentences, quotes their actual phrasing)
  - **striking moments** — 3–5 editorial pull-quotes from your history with this person
  - **deep dive** — opt-in chunked map-reduce read of every 1:1 message, synthesizing the shape of the relationship period by period
  - scoped Q&A box for asking about *this conversation specifically*
- **archive Q&A** — natural-language questions across the entire archive ("who do i fight with most?", "who haven't i texted in 6 months?"). Browser-driven tool-use loop: Claude requests `search_messages` / `rank_contacts_in_range` / `get_contact_summary` and the browser runs them locally against the in-memory `chat.db`.

## privacy

- `chat.db` is loaded into the **browser** via WebAssembly SQLite (sql.js). every query runs locally; no server ever sees the file.
- the user's contacts (`AddressBook-v22.abcddb`) are loaded the same way and merged into a name map locally.
- both files are persisted in **OPFS** (origin-private filesystem), so they survive page reloads but are scoped to the threads origin and never leave the machine.
- the **only** thing that goes to an LLM is short context snippets from the messages — and only when you ask a question or open a contact view.
- there's no account, no cloud sync, no analytics.

## stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4
- sql.js (WebAssembly SQLite) + OPFS for in-browser persistence
- IndexedDB cache for AI results
- Anthropic API (Claude Haiku 4.5) via a thin server-side proxy at `/api/llm` — keeps the API key off the client and rate-limits per-IP

## first-time setup (dev)

```bash
npm install
cp .env.local.example .env.local
# add THREADS_LLM_KEY=<your anthropic api key>
npm run dev
```

Open http://localhost:3000 and follow the onboarding flow. Stage your data on the Desktop with the one-liner the page shows you, then upload it via the file pickers.

## deploying

1. Set a hard monthly spend cap on Anthropic (console.anthropic.com → Settings → Limits)
2. Push to GitHub, connect to Vercel
3. Add the `THREADS_LLM_KEY` env var
4. Deploy

The app is fully static + a single serverless route (`/api/llm`), so any Vercel tier works.

## architecture notes

- **1:1 vs group-chat attribution:** stats include both (so a person you mostly group-chat with still ranks). AI message extraction uses 1:1 only — group-chat messages they sent are addressed to whoever's in the group, not the user, and including them confuses analyses like "what nicknames do they use for me".
- **Stratified sampling:** for high-volume contacts, the per-contact AI samples messages spread evenly across the full history (NTILE-bucketed), not the most recent N — otherwise the texture summary biases toward the last few days.
- **Tool-use loop runs in the browser** for the archive Q&A. The proxy at `/api/llm` is intentionally stateless: the browser orchestrates every turn, so the server never has to read the user's `chat.db`.
- **Cost control:** per-IP rate limit (60 req/min token bucket), origin allowlist in production, hard `max_tokens` cap. The real safety net is the Anthropic spend cap.
