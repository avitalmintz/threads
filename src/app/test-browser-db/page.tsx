// Smoke test for the browser-side chat.db reader. Pick chat.db and (separately)
// the AddressBook folder, the app loads them into in-memory sql.js, runs a
// handful of queries, and shows the results. If everything looks right here,
// the rest of the port can reuse this same path for real pages.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAddressBooks } from "@/lib/browser-contacts";
import {
  closeBrowserDb,
  getHandleDetail,
  getHandleSummaries,
  getStats,
  getTextureStats,
  openBrowserDb,
  type ChatDatabaseStats,
  type HandleDetail,
  type HandleSummary,
  type TextureStats,
} from "@/lib/browser-db";
import {
  hasChatDb,
  loadAddressBookBytes,
  loadChatDb,
} from "@/lib/browser-storage";

type LoadResult = {
  loadMs: number;
  fileSizeMb: number;
  stats: ChatDatabaseStats;
  topSummaries: HandleSummary[];
  topDetail: HandleDetail | null;
  topTexture: TextureStats | null;
  detailMs: number;
  textureMs: number;
  summariesMs: number;
  contactsLoaded: number;
  contactsFiles: number;
  contactsWarnings: string[];
};

function fmt(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// Module-level timer helper. Defining it inside the component triggers
// react-hooks/purity (it flags Date.now / performance.now as impure). It's
// fine in event handlers, but the rule doesn't know that — so we hoist.
const timer = (): number => Date.now();

// Augment HTMLInputElement props with the non-standard but widely-supported
// directory picker attribute. (Type-safe alternative to a global declaration.)
type DirInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

export default function TestBrowserDbPage() {
  const [result, setResult] = useState<LoadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("");
  const [chatDbFile, setChatDbFile] = useState<File | null>(null);
  const [addressBookFiles, setAddressBookFiles] = useState<File[]>([]);
  const [savedAvailable, setSavedAvailable] = useState<boolean>(false);

  // Detect persisted data so we can offer "use my saved data" instead of
  // forcing a fresh re-upload on every visit.
  useEffect(() => {
    let cancelled = false;
    hasChatDb().then((v) => {
      if (!cancelled) setSavedAvailable(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddressBookFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    // webkitdirectory drops every file in the folder; we only want .abcddb
    const abcddb = all.filter((f) => f.name.endsWith(".abcddb"));
    setAddressBookFiles(abcddb);
  }

  async function runFromSaved() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setStage("loading chat.db from local storage…");
      const t0 = timer();
      const bytes = await loadChatDb();
      if (!bytes) throw new Error("no saved chat.db found");

      setStage("loading saved addressbooks…");
      const abBytes = await loadAddressBookBytes();

      let contactsLoaded = 0;
      let contactsFiles = 0;
      let contactsWarnings: string[] = [];
      if (abBytes.length > 0) {
        setStage("indexing contact names…");
        const ab = await loadAddressBooks(abBytes);
        contactsLoaded = ab.contactCount;
        contactsFiles = ab.filesProcessed;
        contactsWarnings = ab.warnings;
      }

      setStage("initializing sql.js + opening db…");
      await openBrowserDb(bytes);
      const loadMs = timer() - t0;
      const fileSizeMb = bytes.byteLength / (1024 * 1024);
      await runRemainingQueriesAndSet(loadMs, fileSizeMb, {
        contactsLoaded,
        contactsFiles,
        contactsWarnings,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      closeBrowserDb();
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    if (!chatDbFile) {
      setError("pick chat.db first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. AddressBooks first so name resolution is hot when summaries run.
      let contactsLoaded = 0;
      let contactsFiles = 0;
      let contactsWarnings: string[] = [];
      if (addressBookFiles.length > 0) {
        setStage(`reading ${addressBookFiles.length} addressbook file(s)…`);
        const bytesPerFile = await Promise.all(
          addressBookFiles.map(async (f) => ({
            name: f.name,
            bytes: new Uint8Array(await f.arrayBuffer()),
          })),
        );
        setStage("indexing contact names…");
        const ab = await loadAddressBooks(bytesPerFile);
        contactsLoaded = ab.contactCount;
        contactsFiles = ab.filesProcessed;
        contactsWarnings = ab.warnings;
      }

      // 2. chat.db
      setStage("reading chat.db…");
      const t0 = timer();
      const buf = await chatDbFile.arrayBuffer();
      const bytes = new Uint8Array(buf);

      setStage("initializing sql.js + opening db…");
      await openBrowserDb(bytes);
      const loadMs = timer() - t0;
      await runRemainingQueriesAndSet(loadMs, chatDbFile.size / (1024 * 1024), {
        contactsLoaded,
        contactsFiles,
        contactsWarnings,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      closeBrowserDb();
    } finally {
      setLoading(false);
    }
  }

  // Shared tail used by both fresh-upload and OPFS paths: stats query →
  // handle summaries → top-contact detail/texture → set the result.
  async function runRemainingQueriesAndSet(
    loadMs: number,
    fileSizeMb: number,
    contacts: { contactsLoaded: number; contactsFiles: number; contactsWarnings: string[] },
  ) {
    setStage("running stats query…");
    const stats = getStats();

    setStage("running handle summaries (the heavy one)…");
    const t1 = timer();
    const summaries = getHandleSummaries();
    const summariesMs = timer() - t1;
    const topSummaries = summaries.slice(0, 10);

    let topDetail: HandleDetail | null = null;
    let topTexture: TextureStats | null = null;
    let detailMs = 0;
    let textureMs = 0;

    if (topSummaries.length > 0) {
      const topId = topSummaries[0].handle.id;

      setStage(`loading detail for handle ${topId}…`);
      const t2 = timer();
      topDetail = getHandleDetail(topId, 30, "auto");
      detailMs = timer() - t2;

      setStage(`computing texture stats for handle ${topId}…`);
      const t3 = timer();
      topTexture = getTextureStats(topId);
      textureMs = timer() - t3;
    }

    setResult({
      loadMs,
      fileSizeMb,
      stats,
      topSummaries,
      topDetail,
      topTexture,
      detailMs,
      textureMs,
      summariesMs,
      contactsLoaded: contacts.contactsLoaded,
      contactsFiles: contacts.contactsFiles,
      contactsWarnings: contacts.contactsWarnings,
    });
    setStage("");
  }

  return (
    <main className="px-6 py-12 sm:px-12 sm:py-16 max-w-4xl mx-auto">
      <Link
        href="/onboard"
        className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-6 inline-block"
      >
        ← onboarding
      </Link>
      <h1 className="font-[family-name:var(--font-serif)] text-4xl italic mb-2">
        browser sqlite smoke test
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-8">
        loads chat.db + AddressBook into sql.js (wasm) running entirely in your
        browser, then verifies the queries that power the rest of the app
        return the expected shapes. nothing is uploaded anywhere.
      </p>

      {savedAvailable && (
        <div className="mb-8 border-l-2 border-[var(--color-rule-strong)] pl-5 py-3">
          <p className="text-sm text-[var(--color-text-muted)] mb-2">
            you already have data in local storage from a previous upload.
          </p>
          <button
            onClick={runFromSaved}
            disabled={loading}
            className="border-b border-[var(--color-text)] pb-1 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic disabled:opacity-50"
          >
            run smoke test on saved data →
          </button>
        </div>
      )}

      <div className="space-y-5 mb-8">
        <label className="block">
          <span className="block text-sm text-[var(--color-text-muted)] mb-2">
            1. pick chat.db
          </span>
          <input
            type="file"
            accept=".db,application/x-sqlite3,application/octet-stream"
            onChange={(e) => setChatDbFile(e.target.files?.[0] ?? null)}
            disabled={loading}
            className="block text-sm"
          />
          {chatDbFile && (
            <p className="text-xs text-[var(--color-text-faint)] mt-1">
              {chatDbFile.name} · {(chatDbFile.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          )}
        </label>

        <label className="block">
          <span className="block text-sm text-[var(--color-text-muted)] mb-2">
            2. pick AddressBook folder (optional, but contact names won&apos;t
            resolve without it)
          </span>
          <input
            type="file"
            // webkitdirectory: lets the user pick a folder; we'll filter to
            // *.abcddb files. Standard "directory" attribute is the modern
            // proposal but webkitdirectory has the widest support today.
            {...({
              webkitdirectory: "",
              directory: "",
              multiple: true,
            } satisfies Partial<DirInputProps>)}
            onChange={handleAddressBookFolder}
            disabled={loading}
            className="block text-sm"
          />
          {addressBookFiles.length > 0 && (
            <p className="text-xs text-[var(--color-text-faint)] mt-1">
              {addressBookFiles.length} .abcddb file
              {addressBookFiles.length === 1 ? "" : "s"} found
            </p>
          )}
          <p className="text-xs text-[var(--color-text-faint)] italic mt-1">
            tip: pick <code>data/AddressBook</code> (or, in production, your{" "}
            <code>~/Library/Application Support/AddressBook</code> folder).
          </p>
        </label>

        <button
          onClick={run}
          disabled={loading || !chatDbFile}
          className="border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic disabled:opacity-50 disabled:cursor-not-allowed"
        >
          run smoke test →
        </button>
      </div>

      {loading && (
        <div className="border-l-2 border-[var(--color-mood-summer,#d4a574)] pl-4 py-2 text-sm italic">
          {stage || "working…"}
        </div>
      )}

      {error && (
        <div className="border-l-2 border-red-400 pl-4 py-2 mb-6">
          <p className="text-sm font-mono text-red-700 whitespace-pre-wrap break-all">
            {error}
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-8 mt-8">
          <section>
            <h2 className="font-[family-name:var(--font-serif)] text-xl italic mb-2">
              load
            </h2>
            <ul className="text-sm space-y-1">
              <li>chat.db: {result.fileSizeMb.toFixed(1)} MB</li>
              <li>file → wasm db: {fmtMs(result.loadMs)}</li>
              <li>getHandleSummaries: {fmtMs(result.summariesMs)}</li>
              <li>getHandleDetail (top contact): {fmtMs(result.detailMs)}</li>
              <li>getTextureStats (top contact): {fmtMs(result.textureMs)}</li>
              <li>
                contacts: {result.contactsLoaded.toLocaleString()} from{" "}
                {result.contactsFiles} addressbook
                {result.contactsFiles === 1 ? "" : "s"}
                {result.contactsWarnings.length > 0 && (
                  <ul className="text-xs text-[var(--color-text-faint)] mt-1 ml-4 list-disc">
                    {result.contactsWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-serif)] text-xl italic mb-2">
              stats
            </h2>
            <ul className="text-sm space-y-1">
              <li>handles: {result.stats.handleCount.toLocaleString()}</li>
              <li>chats: {result.stats.chatCount.toLocaleString()}</li>
              <li>messages: {result.stats.messageCount.toLocaleString()}</li>
              <li>
                range: {fmt(result.stats.earliestMessage)} →{" "}
                {fmt(result.stats.latestMessage)}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-[family-name:var(--font-serif)] text-xl italic mb-2">
              top 10 handles
            </h2>
            <table className="text-sm w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
                  <th className="py-1 pr-3">id</th>
                  <th className="py-1 pr-3">name / identifier</th>
                  <th className="py-1 pr-3 text-right">total</th>
                  <th className="py-1 pr-3 text-right">me</th>
                  <th className="py-1 pr-3 text-right">them</th>
                  <th className="py-1 pr-3 text-right">last 30d</th>
                </tr>
              </thead>
              <tbody>
                {result.topSummaries.map((s) => (
                  <tr key={s.handle.id} className="border-t border-[var(--color-rule)]">
                    <td className="py-1 pr-3 font-mono text-xs">
                      {s.handle.id}
                    </td>
                    <td className="py-1 pr-3 truncate max-w-[260px]">
                      {s.contactName ? (
                        <>
                          <span>{s.contactName}</span>{" "}
                          <span className="text-xs text-[var(--color-text-faint)] font-mono">
                            ({s.handle.identifier})
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-xs">
                          {s.handle.identifier}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {s.totalMessages.toLocaleString()}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {s.messagesFromMe.toLocaleString()}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {s.messagesFromThem.toLocaleString()}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {s.recent30.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {result.topDetail && (
            <section>
              <h2 className="font-[family-name:var(--font-serif)] text-xl italic mb-2">
                top contact detail
              </h2>
              <ul className="text-sm space-y-1 mb-3">
                <li>
                  display name: {result.topDetail.displayName}
                  {result.topDetail.contactName && (
                    <span className="text-xs text-[var(--color-text-faint)] font-mono ml-2">
                      ({result.topDetail.handle.identifier})
                    </span>
                  )}
                </li>
                <li>
                  total: {result.topDetail.totalMessages.toLocaleString()} ·
                  me: {result.topDetail.messagesFromMe.toLocaleString()} ·
                  them: {result.topDetail.messagesFromThem.toLocaleString()}
                </li>
                <li>
                  range: {fmt(result.topDetail.earliest)} →{" "}
                  {fmt(result.topDetail.latest)}
                </li>
                <li>monthly buckets: {result.topDetail.monthlyCounts.length}</li>
                <li>
                  recent messages sampled (auto):{" "}
                  {result.topDetail.recentMessages.length}
                </li>
              </ul>
              {result.topDetail.recentMessages.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer italic text-[var(--color-text-faint)]">
                    show first + last sampled message
                  </summary>
                  <pre className="mt-2 text-xs whitespace-pre-wrap font-mono">
                    [first] {fmt(result.topDetail.recentMessages[0].date)} —{" "}
                    {result.topDetail.recentMessages[0].isFromMe ? "me" : "them"}
                    {"\n"}
                    {result.topDetail.recentMessages[0].text.slice(0, 200)}
                    {"\n\n"}
                    [last]{" "}
                    {fmt(
                      result.topDetail.recentMessages[
                        result.topDetail.recentMessages.length - 1
                      ].date,
                    )}{" "}
                    —{" "}
                    {result.topDetail.recentMessages[
                      result.topDetail.recentMessages.length - 1
                    ].isFromMe
                      ? "me"
                      : "them"}
                    {"\n"}
                    {result.topDetail.recentMessages[
                      result.topDetail.recentMessages.length - 1
                    ].text.slice(0, 200)}
                  </pre>
                </details>
              )}
            </section>
          )}

          {result.topTexture && (
            <section>
              <h2 className="font-[family-name:var(--font-serif)] text-xl italic mb-2">
                top contact texture
              </h2>
              <ul className="text-sm space-y-1">
                <li>peak hour: {result.topTexture.peakHour}:00</li>
                <li>
                  peak day:{" "}
                  {
                    ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
                      result.topTexture.peakDay
                    ]
                  }
                </li>
                <li>longest streak: {result.topTexture.longestStreakDays} days</li>
                <li>longest gap: {result.topTexture.longestGapDays} days</li>
                <li>
                  median response:{" "}
                  {result.topTexture.medianResponseSeconds !== null
                    ? `${Math.round(result.topTexture.medianResponseSeconds)}s`
                    : "—"}
                </li>
                <li>
                  initiations — me: {result.topTexture.initiationsByMe} · them:{" "}
                  {result.topTexture.initiationsByThem}
                </li>
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
