"use client";

import { Fragment, useState } from "react";
import { askArchive, askContact } from "@/lib/browser-ask";

const ARCHIVE_SUGGESTIONS = [
  "who do i talk to most?",
  "who am i drifting from?",
  "who do i fight with most?",
  "who haven't i texted in 3+ months?",
];

const CONTACT_SUGGESTIONS = [
  "what do we usually fight about?",
  "what do we mostly talk about?",
  "what do they care about right now?",
  "what inside jokes do we share?",
];

// Minimal markdown-ish renderer for Claude responses. Handles **bold**, lists,
// and paragraph breaks. Keeps things in plain React (no library).
function FormattedAnswer({ text }: { text: string }) {
  // Split into paragraphs by double newlines
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        // Detect numbered or bulleted list
        const lines = p.split("\n");
        const isNumberedList = lines.every((l) => /^\d+[.)]\s+/.test(l.trim()));
        const isBulletList = lines.every((l) => /^[-*]\s+/.test(l.trim()));
        if (isNumberedList || isBulletList) {
          const Tag = isNumberedList ? "ol" : "ul";
          return (
            <Tag
              key={i}
              className={
                isNumberedList
                  ? "list-decimal pl-6 space-y-1"
                  : "list-disc pl-6 space-y-1"
              }
            >
              {lines.map((line, j) => {
                const stripped = line.replace(/^(\d+[.)]\s+|[-*]\s+)/, "");
                return (
                  <li key={j}>
                    <InlineMarkdown text={stripped} />
                  </li>
                );
              })}
            </Tag>
          );
        }
        // Regular paragraph — preserve internal newlines as <br />
        return (
          <p key={i} className="leading-relaxed">
            {lines.map((line, j) => (
              <Fragment key={j}>
                <InlineMarkdown text={line} />
                {j < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// Renders inline **bold** and *italic*. Skips other markdown.
function InlineMarkdown({ text }: { text: string }) {
  // Split on bold (**...**) first, then italic (*...*).
  const parts: Array<{ type: "text" | "bold" | "italic"; value: string }> = [];
  const boldRe = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    parts.push({ type: "bold", value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }
  if (parts.length === 0) parts.push({ type: "text", value: text });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "bold" ? (
          <strong key={i} className="font-semibold text-[var(--color-text)]">
            {p.value}
          </strong>
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        ),
      )}
    </>
  );
}

export function AskBox({
  scope,
}: {
  // When `scope` is provided, the ask is limited to messages with that
  // specific contact. The UI + suggestions adapt accordingly.
  scope?: { contactId: number; displayName: string };
} = {}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = scope ? CONTACT_SUGGESTIONS : ARCHIVE_SUGGESTIONS;

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      // Browser-side: build context from in-memory chat.db, run the
      // tool-use loop locally, hit /api/llm only for model calls.
      const result = scope
        ? await askContact(scope.contactId, q)
        : await askArchive(q);
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  const placeholder = scope
    ? `what do we mostly talk about?`
    : `who haven't i texted in 6 months?`;
  const headerEyebrow = scope
    ? `ask about ${scope.displayName.toLowerCase()},`
    : `ask anything,`;
  const headerTitle = scope
    ? `question your conversation`
    : `question your archive`;

  return (
    <section className="mb-4 relative">
      <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
        {headerEyebrow}
      </p>
      <h2 className="font-[family-name:var(--font-serif)] text-3xl italic text-[var(--color-text)] mb-4 leading-tight">
        {headerTitle}
      </h2>

      <form onSubmit={handleSubmit} className="mb-3">
        <div className="flex items-baseline gap-2 border-b-2 border-[var(--color-text)] focus-within:border-[var(--color-accent)] transition-colors">
          <span className="text-[var(--color-text-faint)] text-lg font-[family-name:var(--font-serif)] italic shrink-0">
            ⤿
          </span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            className="flex-1 bg-transparent py-2 text-base font-[family-name:var(--font-serif)] italic text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="text-sm font-[family-name:var(--font-serif)] italic text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-40 transition-colors shrink-0 py-2"
          >
            {loading ? "thinking…" : "ask →"}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={loading}
            className="font-[family-name:var(--font-serif)] italic text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition-colors disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      {(answer || error || loading) && (
        <div
          className="mt-6 border-l-2 pl-5 py-3 transition-colors"
          style={{
            borderColor: error
              ? "var(--mood-longing)"
              : loading
              ? "var(--mood-summer)"
              : "var(--color-accent)",
          }}
        >
          {loading && (
            <div className="flex items-center gap-3">
              <span className="inline-block size-2 rounded-full bg-[var(--mood-summer)] animate-pulse" />
              <p className="text-base text-[var(--color-text-muted)] italic font-[family-name:var(--font-serif)]">
                reading your messages — this can take 5-10 seconds…
              </p>
            </div>
          )}
          {error && (
            <div>
              <p className="text-sm font-[family-name:var(--font-serif)] italic text-[var(--mood-longing)] mb-1">
                something went wrong:
              </p>
              <pre className="text-xs text-[var(--color-text-muted)] font-mono whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}
          {answer && (
            <div className="text-base text-[var(--color-text)] leading-relaxed">
              <FormattedAnswer text={answer} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
