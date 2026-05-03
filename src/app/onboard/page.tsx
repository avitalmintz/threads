// Production onboarding flow.
//
// First-time visitors hit this page, see what the app needs (chat.db +
// AddressBook), copy a one-liner that stages the files on their Desktop,
// pick those files via the browser pickers, and we persist everything to
// OPFS. Returning visitors with data already in OPFS get a "welcome back"
// summary and can jump straight into the app.
//
// Why staged on Desktop rather than picked directly from ~/Library: macOS
// TCC blocks browsers from reading ~/Library/Messages and AddressBook
// without granting the *browser* full disk access. That's a privacy
// non-starter — Chrome with FDA can read everything you own. Terminal is
// a much narrower ask, and most users have already granted it (or know
// the prompt). So we copy first, upload from Desktop.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAddressBooks } from "@/lib/browser-contacts";
import {
  getStats,
  openBrowserDb,
  type ChatDatabaseStats,
} from "@/lib/browser-db";
import {
  addressBookCount,
  clearAll,
  getChatDbSize,
  getStorageEstimate,
  hasChatDb,
  loadAddressBookBytes,
  loadChatDb,
  saveAddressBooks,
  saveChatDb,
} from "@/lib/browser-storage";

// The one-liner ends with `ls -lh` so the user immediately sees whether
// files copied. If chat.db is missing from the listing, they'll know the
// Full Disk Access step didn't take effect (or wasn't granted).
const ONE_LINER = `mkdir -p ~/Desktop/threads-data && \\
  cp ~/Library/Messages/chat.db ~/Desktop/threads-data/ && \\
  cp -R ~/Library/Application\\ Support/AddressBook ~/Desktop/threads-data/ && \\
  echo "" && echo "✓ done. files in ~/Desktop/threads-data/:" && \\
  ls -lh ~/Desktop/threads-data/`;

type DirInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

type Status =
  | { kind: "loading-existing" }
  | { kind: "no-data" }
  | { kind: "have-data"; chatDbSizeMb: number; addressBookCount: number; stats: ChatDatabaseStats | null }
  | { kind: "uploading"; stage: string }
  | { kind: "uploaded"; stats: ChatDatabaseStats; chatDbSizeMb: number; addressBookCount: number }
  | { kind: "error"; message: string };

export default function OnboardPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading-existing" });
  const [chatDbFile, setChatDbFile] = useState<File | null>(null);
  const [addressBookFiles, setAddressBookFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const [storage, setStorage] = useState<{ usageMb: number | null; quotaMb: number | null }>({
    usageMb: null,
    quotaMb: null,
  });
  const [isMac, setIsMac] = useState<boolean>(true);

  // Hoisted derived flag — used inside type-narrowed branches where checking
  // `status.kind === "uploading"` is statically impossible (TS rightly errors).
  const isUploading = status.kind === "uploading";

  // On mount: detect platform, check for existing OPFS data, read storage quota.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Platform sniff — soft warning, not a hard block.
      if (typeof navigator !== "undefined") {
        const ua = navigator.userAgent || "";
        setIsMac(/Mac|Macintosh/.test(ua) || /\bMac OS\b/.test(ua));
      }

      const est = await getStorageEstimate();
      if (!cancelled) setStorage(est);

      const had = await hasChatDb();
      if (cancelled) return;
      if (!had) {
        setStatus({ kind: "no-data" });
        return;
      }
      // Data exists. Try to open it (cheap) and pull a stats snapshot.
      try {
        const sizeBytes = (await getChatDbSize()) ?? 0;
        const abCount = await addressBookCount();
        const bytes = await loadChatDb();
        if (!bytes) {
          setStatus({ kind: "no-data" });
          return;
        }
        await openBrowserDb(bytes);
        // Hydrate the in-memory contact map too, so contact names work
        // immediately on whatever page they land on next.
        const abBytes = await loadAddressBookBytes();
        if (abBytes.length > 0) await loadAddressBooks(abBytes);
        const stats = getStats();
        if (cancelled) return;
        setStatus({
          kind: "have-data",
          chatDbSizeMb: sizeBytes / (1024 * 1024),
          addressBookCount: abCount,
          stats,
        });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddressBookFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    const abcddb = all.filter((f) => f.name.endsWith(".abcddb"));
    setAddressBookFiles(abcddb);
  }

  async function copyOneLiner() {
    try {
      await navigator.clipboard.writeText(ONE_LINER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — user can manually select. No-op.
    }
  }

  async function loadAndPersist() {
    if (!chatDbFile) {
      setStatus({ kind: "error", message: "pick chat.db first" });
      return;
    }
    setStatus({ kind: "uploading", stage: "reading chat.db…" });

    try {
      // chat.db
      const chatDbBytes = new Uint8Array(await chatDbFile.arrayBuffer());

      setStatus({ kind: "uploading", stage: "saving chat.db to local storage…" });
      await saveChatDb(chatDbBytes);

      // AddressBooks (optional)
      const abBytes: { name: string; webkitRelativePath?: string; bytes: Uint8Array }[] = [];
      if (addressBookFiles.length > 0) {
        setStatus({
          kind: "uploading",
          stage: `reading ${addressBookFiles.length} addressbook file${addressBookFiles.length === 1 ? "" : "s"}…`,
        });
        for (const f of addressBookFiles) {
          abBytes.push({
            name: f.name,
            webkitRelativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath,
            bytes: new Uint8Array(await f.arrayBuffer()),
          });
        }
        setStatus({ kind: "uploading", stage: "saving addressbooks…" });
        await saveAddressBooks(abBytes);
      }

      // Open the DB so the next page transition is instant.
      setStatus({ kind: "uploading", stage: "opening database…" });
      await openBrowserDb(chatDbBytes);

      if (abBytes.length > 0) {
        setStatus({ kind: "uploading", stage: "indexing contact names…" });
        await loadAddressBooks(abBytes.map((b) => ({ name: b.name, bytes: b.bytes })));
      }

      setStatus({ kind: "uploading", stage: "computing stats…" });
      const stats = getStats();

      setStatus({
        kind: "uploaded",
        stats,
        chatDbSizeMb: chatDbFile.size / (1024 * 1024),
        addressBookCount: addressBookFiles.length,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleClearAndReload() {
    if (
      !confirm(
        "wipe the local copy of chat.db + AddressBook from this browser? you'll need to upload them again to use the app.",
      )
    ) {
      return;
    }
    await clearAll();
    setStatus({ kind: "no-data" });
    setChatDbFile(null);
    setAddressBookFiles([]);
  }

  return (
    <main className="relative min-h-dvh px-6 py-12 sm:px-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <header className="mb-12">
          <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
            welcome to,
          </p>
          <h1 className="font-[family-name:var(--font-serif)] text-5xl sm:text-6xl italic leading-tight text-[var(--color-text)]">
            threads
          </h1>
          <p className="mt-4 text-base text-[var(--color-text-muted)] max-w-prose leading-relaxed">
            a quiet read through every iMessage you&apos;ve sent. heatmaps,
            arcs, the way each person talks to you, the moments that stand
            out. nothing leaves your machine. chat.db lives in your browser,
            queries run locally, only summaries pass through an LLM.
          </p>
        </header>

        {!isMac && (
          <section className="mb-10 border-l-2 border-[var(--color-rule-strong)] pl-5 py-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              threads reads <code>chat.db</code> from macOS&apos;s Messages app.
              we don&apos;t see how to do that on your platform. sorry. if
              you&apos;re on a Mac, ignore this.
            </p>
          </section>
        )}

        {status.kind === "loading-existing" && (
          <section className="mb-10">
            <p className="text-sm italic text-[var(--color-text-faint)] animate-pulse">
              checking for saved data…
            </p>
          </section>
        )}

        {status.kind === "have-data" && (
          <section className="mb-12 border-t border-[var(--color-rule)] pt-8">
            <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] mb-2">
              welcome back,
            </p>
            <h2 className="font-[family-name:var(--font-serif)] text-3xl italic leading-tight text-[var(--color-text)] mb-4">
              your data is already here
            </h2>
            <ul className="text-sm text-[var(--color-text-muted)] space-y-1 mb-6">
              <li>chat.db: {status.chatDbSizeMb.toFixed(1)} MB</li>
              <li>
                addressbooks: {status.addressBookCount} file
                {status.addressBookCount === 1 ? "" : "s"}
              </li>
              {status.stats && (
                <>
                  <li>
                    handles: {status.stats.handleCount.toLocaleString()} ·
                    messages: {status.stats.messageCount.toLocaleString()}
                  </li>
                </>
              )}
            </ul>
            <div className="flex flex-wrap gap-6 items-baseline">
              <Link
                href="/threads"
                className="border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
              >
                open threads →
              </Link>
              <button
                onClick={() => setStatus({ kind: "no-data" })}
                className="text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--color-text)] transition-colors"
              >
                upload fresh data →
              </button>
              <button
                onClick={handleClearAndReload}
                className="text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--mood-longing,#a04040)] transition-colors"
              >
                wipe my data →
              </button>
            </div>
          </section>
        )}

        {(status.kind === "no-data" || status.kind === "error") && (
          <>
            <section className="mb-10 border-t border-[var(--color-rule)] pt-8">
              <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
                step one,
              </p>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-3 leading-tight">
                give Terminal Full Disk Access
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] max-w-prose leading-relaxed mb-4">
                macOS protects <code>~/Library/Messages/</code> by default.
                without this, the next step appears to succeed but actually
                copies nothing. you only need to do it once.
              </p>
              <ol className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-1 mb-3 list-decimal pl-5">
                <li>
                  open <strong>System Settings</strong> (apple menu in the
                  top-left)
                </li>
                <li>
                  <strong>Privacy &amp; Security</strong> in the sidebar
                </li>
                <li>
                  <strong>Full Disk Access</strong>
                </li>
                <li>
                  click the <strong>+</strong> and add{" "}
                  <strong>Terminal</strong> (or whichever terminal app you
                  use, like iTerm or Warp)
                </li>
                <li>toggle it on, then quit and reopen your terminal app</li>
              </ol>
              <p className="text-xs italic text-[var(--color-text-faint)]">
                already done? skip ahead.
              </p>
            </section>

            <section className="mb-10 border-t border-[var(--color-rule)] pt-8">
              <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
                step two,
              </p>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-3 leading-tight">
                copy your data to the desktop
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] max-w-prose leading-relaxed mb-4">
                paste this into your terminal. it copies <code>chat.db</code>{" "}
                and your AddressBook into a folder on your desktop, then
                lists what got copied so you can confirm it worked.
              </p>
              <div className="rounded border border-[var(--color-rule)] bg-[var(--color-bg-soft,rgba(0,0,0,0.03))] overflow-hidden">
                <pre className="text-xs font-mono p-4 overflow-x-auto whitespace-pre text-[var(--color-text)]">
                  {ONE_LINER}
                </pre>
                <div className="border-t border-[var(--color-rule)] px-4 py-2 flex justify-between items-center">
                  <p className="text-xs italic text-[var(--color-text-faint)]">
                    {copied
                      ? "copied. now paste it in Terminal."
                      : "if you see Operation not permitted, redo step one."}
                  </p>
                  <button
                    onClick={copyOneLiner}
                    className="text-xs italic font-[family-name:var(--font-serif)] border-b border-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {copied ? "✓ copied" : "copy command"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-3 max-w-prose leading-relaxed">
                you should see a <code>chat.db</code> line and an{" "}
                <code>AddressBook</code> line printed at the end. if either
                is missing, Full Disk Access isn&apos;t actually granted.
              </p>
            </section>

            <section className="mb-10 border-t border-[var(--color-rule)] pt-8">
              <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
                step three,
              </p>
              <h2 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-6 leading-tight">
                upload from <code>~/Desktop/threads-data/</code>
              </h2>

              <div className="space-y-8">
                {/* chat.db picker — large card, prominent CTA */}
                <div className="rounded border border-[var(--color-rule)] p-5 bg-[var(--color-bg-soft,rgba(0,0,0,0.02))]">
                  <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-2">
                    file 1 of 2
                  </p>
                  <h3 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-1 leading-tight">
                    pick <code className="not-italic font-mono">chat.db</code>
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] mb-4">
                    the SQLite file directly inside{" "}
                    <code>~/Desktop/threads-data/</code>.
                  </p>
                  <input
                    type="file"
                    accept=".db,application/x-sqlite3,application/octet-stream"
                    onChange={(e) => setChatDbFile(e.target.files?.[0] ?? null)}
                    disabled={isUploading}
                    className="block text-sm"
                  />
                  {chatDbFile && (
                    <p className="text-sm text-[var(--color-text)] italic mt-3 font-[family-name:var(--font-serif)]">
                      ✓ {chatDbFile.name} ·{" "}
                      <span className="text-xs text-[var(--color-text-faint)] not-italic font-mono">
                        {(chatDbFile.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </p>
                  )}
                </div>

                {/* AddressBook folder picker */}
                <div className="rounded border border-[var(--color-rule)] p-5 bg-[var(--color-bg-soft,rgba(0,0,0,0.02))]">
                  <p className="font-[family-name:var(--font-serif)] italic text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-2">
                    file 2 of 2 (recommended)
                  </p>
                  <h3 className="font-[family-name:var(--font-serif)] text-2xl italic text-[var(--color-text)] mb-1 leading-tight">
                    pick the <code className="not-italic font-mono">AddressBook</code> folder
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] mb-4">
                    the whole folder inside{" "}
                    <code>~/Desktop/threads-data/</code>. your browser will
                    ask &ldquo;upload all files?&rdquo;, say yes. without
                    this, contacts show as raw phone numbers.
                  </p>
                  <input
                    type="file"
                    {...({
                      webkitdirectory: "",
                      directory: "",
                      multiple: true,
                    } satisfies Partial<DirInputProps>)}
                    onChange={handleAddressBookFolder}
                    disabled={isUploading}
                    className="block text-sm"
                  />
                  {addressBookFiles.length > 0 && (
                    <p className="text-sm text-[var(--color-text)] italic mt-3 font-[family-name:var(--font-serif)]">
                      ✓ {addressBookFiles.length} .abcddb file
                      {addressBookFiles.length === 1 ? "" : "s"} found
                    </p>
                  )}
                </div>

                <button
                  onClick={loadAndPersist}
                  disabled={isUploading || !chatDbFile}
                  className="block w-full sm:w-auto px-6 py-3 rounded border border-[var(--color-text)] text-base text-[var(--color-text)] bg-[var(--color-bg)] hover:bg-[var(--color-text)] hover:text-[var(--color-bg)] transition-colors font-[family-name:var(--font-serif)] italic disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  load my data →
                </button>
              </div>
            </section>

            <section className="text-xs text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] mt-8">
              <p className="mb-1">
                stored locally in this browser via OPFS. wipe anytime.
                {storage.quotaMb && (
                  <>
                    {" "}browser quota: ~{Math.round(storage.quotaMb).toLocaleString()} MB available.
                  </>
                )}
              </p>
            </section>
          </>
        )}

        {status.kind === "uploading" && (
          <section className="mt-6 border-l-2 border-[var(--color-mood-summer,#d4a574)] pl-5 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-block size-2 rounded-full bg-[var(--color-mood-summer,#d4a574)] animate-pulse" />
              <p className="text-sm italic font-[family-name:var(--font-serif)] text-[var(--color-text-muted)]">
                {status.stage}
              </p>
            </div>
          </section>
        )}

        {status.kind === "error" && (
          <section className="mt-6 border-l-2 border-[var(--mood-longing,#a04040)] pl-5 py-4">
            <p className="text-sm font-[family-name:var(--font-serif)] italic text-[var(--mood-longing,#a04040)] mb-2">
              something went wrong:
            </p>
            <pre className="text-xs text-[var(--color-text-muted)] font-mono whitespace-pre-wrap break-all mb-4">
              {status.message}
            </pre>
            <div className="flex flex-wrap gap-6 items-baseline">
              <button
                onClick={handleClearAndReload}
                className="text-sm text-[var(--color-text)] italic font-[family-name:var(--font-serif)] border-b border-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                wipe local data and start over →
              </button>
              <button
                onClick={() =>
                  setStatus({ kind: "no-data" })
                }
                className="text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--color-text)] transition-colors"
              >
                pick different files →
              </button>
            </div>
          </section>
        )}

        {status.kind === "uploaded" && (
          <section className="mt-10 border-t border-[var(--color-rule)] pt-8">
            <p className="font-[family-name:var(--font-serif)] italic text-sm text-[var(--color-text-faint)] tracking-wide mb-2">
              loaded,
            </p>
            <h2 className="font-[family-name:var(--font-serif)] text-3xl italic text-[var(--color-text)] mb-4 leading-tight">
              your messages are ready
            </h2>
            <ul className="text-sm text-[var(--color-text-muted)] space-y-1 mb-6">
              <li>chat.db: {status.chatDbSizeMb.toFixed(1)} MB</li>
              <li>
                addressbooks: {status.addressBookCount} file
                {status.addressBookCount === 1 ? "" : "s"}
              </li>
              <li>
                handles: {status.stats.handleCount.toLocaleString()} · messages:{" "}
                {status.stats.messageCount.toLocaleString()}
              </li>
              <li>
                range:{" "}
                {status.stats.earliestMessage?.toISOString().slice(0, 10) ?? "—"}{" "}
                →{" "}
                {status.stats.latestMessage?.toISOString().slice(0, 10) ?? "—"}
              </li>
            </ul>
            <div className="flex gap-6 items-baseline">
              <Link
                href="/threads"
                className="border-b border-[var(--color-text)] pb-1 text-base text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors font-[family-name:var(--font-serif)] italic"
              >
                open threads →
              </Link>
              <button
                onClick={handleClearAndReload}
                className="text-sm text-[var(--color-text-faint)] italic font-[family-name:var(--font-serif)] hover:text-[var(--mood-longing,#a04040)] transition-colors"
              >
                wipe my data →
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
