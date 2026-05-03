// Persist the user's uploaded chat.db + AddressBook files in OPFS so they
// don't have to re-upload on every visit. OPFS = Origin Private File System,
// a per-origin sandboxed filesystem that survives reloads, isn't visible
// to other sites, and never leaves the device.
//
// Layout:
//   /chat.db                 — the iMessage database, raw bytes
//   /addressbooks/<safe>     — one file per uploaded .abcddb
//
// We deliberately don't use IndexedDB here — for blobs of this size (chat.db
// can be 1+ GB) OPFS is dramatically faster and avoids structured-clone copies.

const ADDRESS_BOOK_DIR = "addressbooks";
const CHAT_DB_FILE = "chat.db";

function opfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

async function root(): Promise<FileSystemDirectoryHandle> {
  if (!opfsAvailable()) {
    throw new Error(
      "OPFS isn't available in this browser. Try a recent Chrome, Safari 17+, or Firefox 111+.",
    );
  }
  return await navigator.storage.getDirectory();
}

// ─────────────────────────────────────────────────────────────────────────────
// chat.db
// ─────────────────────────────────────────────────────────────────────────────

export async function saveChatDb(bytes: Uint8Array): Promise<void> {
  // Ask for persistent storage. Browsers cap unspecified storage tightly;
  // once the user opts in, quotas are larger and the data won't be evicted
  // under storage pressure. This is a no-op if already granted.
  let isPersistent = false;
  if (navigator.storage?.persist) {
    try {
      isPersistent = (await navigator.storage.persist()) ?? false;
    } catch {
      // Some browsers throw if persist isn't supported in the context.
    }
  }

  // Pre-flight quota check. The native error ("operation would exceed
  // storage quota") is technically accurate but doesn't tell the user
  // what to actually do, so we bail early with a friendlier message.
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const quota = est.quota ?? 0;
      const usage = est.usage ?? 0;
      const free = Math.max(0, quota - usage);
      if (quota > 0 && bytes.byteLength > free) {
        const fileMb = bytes.byteLength / (1024 * 1024);
        const freeMb = free / (1024 * 1024);
        const quotaMb = quota / (1024 * 1024);
        const usageMb = usage / (1024 * 1024);

        // Browser-specific advice. Chrome's quota is roughly 6% of free
        // disk, so a small "available" number almost always means a
        // nearly-full hard drive (NOT a browser limitation).
        const lines: string[] = [];
        lines.push(
          `your chat.db is ${fileMb.toFixed(0)} MB but your browser will only let us store ${freeMb.toFixed(0)} MB right now.`,
        );
        if (usage > 50 * 1024 * 1024) {
          lines.push(
            `(${usageMb.toFixed(0)} MB of the ${quotaMb.toFixed(0)} MB total is already taken — wiping local data below would free that.)`,
          );
        } else {
          lines.push(
            "this almost always means your mac's hard drive is close to full. browsers cap local storage at roughly 6% of your free disk space, so freeing up a few gigabytes (empty trash, delete a downloads folder, etc) will fix it.",
          );
        }
        if (!isPersistent) {
          lines.push(
            "tip: refreshing the page once may also help — your browser sometimes increases the quota after the second visit.",
          );
        }
        throw new Error(lines.join("\n\n"));
      }
    } catch (err) {
      // Surface our pre-flight error; swallow estimate-API errors only.
      if (err instanceof Error && err.message.startsWith("your chat.db is")) {
        throw err;
      }
    }
  }

  const dir = await root();
  const fh = await dir.getFileHandle(CHAT_DB_FILE, { create: true });
  const writable = await fh.createWritable();
  // Cast: write() accepts BufferSource; newer TS narrows it so a
  // `Uint8Array<ArrayBufferLike>` isn't directly assignable. In practice
  // the buffer IS a real ArrayBuffer here (built from arrayBuffer()).
  await writable.write(bytes as Uint8Array<ArrayBuffer>);
  await writable.close();
}

export async function loadChatDb(): Promise<Uint8Array | null> {
  if (!opfsAvailable()) return null;
  try {
    const dir = await root();
    const fh = await dir.getFileHandle(CHAT_DB_FILE);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function hasChatDb(): Promise<boolean> {
  if (!opfsAvailable()) return false;
  try {
    const dir = await root();
    await dir.getFileHandle(CHAT_DB_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function getChatDbSize(): Promise<number | null> {
  if (!opfsAvailable()) return null;
  try {
    const dir = await root();
    const fh = await dir.getFileHandle(CHAT_DB_FILE);
    const file = await fh.getFile();
    return file.size;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AddressBook files
//
// We accept many .abcddb files (one per Apple ID source) and store each by a
// "safe key" derived from its path. webkitRelativePath collisions across
// uploads are resolved by appending an index.
// ─────────────────────────────────────────────────────────────────────────────

function safeKey(originalPath: string, fallbackIndex: number): string {
  // Replace path separators and unsafe chars; preserve readability.
  const cleaned = originalPath.replace(/[^A-Za-z0-9._-]+/g, "_");
  if (cleaned.length === 0) return `file_${fallbackIndex}.abcddb`;
  return cleaned;
}

async function getOrCreateAddressBookDir(): Promise<FileSystemDirectoryHandle> {
  const dir = await root();
  return await dir.getDirectoryHandle(ADDRESS_BOOK_DIR, { create: true });
}

export async function saveAddressBooks(
  files: { name: string; webkitRelativePath?: string; bytes: Uint8Array }[],
): Promise<void> {
  const abDir = await getOrCreateAddressBookDir();

  // Wipe existing contents so a re-upload doesn't leave stale entries behind.
  // FileSystemDirectoryHandle.values() is async-iterable.
  for await (const entry of (
    abDir as FileSystemDirectoryHandle & {
      values: () => AsyncIterable<FileSystemHandle>;
    }
  ).values()) {
    await abDir.removeEntry(entry.name).catch(() => {});
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const key = safeKey(f.webkitRelativePath || f.name, i);
    const fh = await abDir.getFileHandle(key, { create: true });
    const writable = await fh.createWritable();
    await writable.write(f.bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
  }
}

export async function loadAddressBookBytes(): Promise<
  { name: string; bytes: Uint8Array }[]
> {
  if (!opfsAvailable()) return [];
  const out: { name: string; bytes: Uint8Array }[] = [];
  try {
    const dir = await root();
    const abDir = await dir.getDirectoryHandle(ADDRESS_BOOK_DIR);
    for await (const entry of (
      abDir as FileSystemDirectoryHandle & {
        values: () => AsyncIterable<FileSystemHandle>;
      }
    ).values()) {
      if (entry.kind !== "file") continue;
      const fh = await abDir.getFileHandle(entry.name);
      const file = await fh.getFile();
      out.push({
        name: entry.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }
  } catch {
    // Directory doesn't exist yet — that's fine.
  }
  return out;
}

export async function addressBookCount(): Promise<number> {
  if (!opfsAvailable()) return 0;
  try {
    const dir = await root();
    const abDir = await dir.getDirectoryHandle(ADDRESS_BOOK_DIR);
    let n = 0;
    for await (const _entry of (
      abDir as FileSystemDirectoryHandle & {
        values: () => AsyncIterable<FileSystemHandle>;
      }
    ).values()) {
      void _entry;
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wipe everything (used by "remove my data" affordance).
// ─────────────────────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  if (!opfsAvailable()) return;
  const dir = await root();
  await dir.removeEntry(CHAT_DB_FILE).catch(() => {});
  await dir
    .removeEntry(ADDRESS_BOOK_DIR, { recursive: true })
    .catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota / storage diagnostics — surface to the user during onboarding so
// they know if a 1GB chat.db will fit.
// ─────────────────────────────────────────────────────────────────────────────

export async function getStorageEstimate(): Promise<{
  usageMb: number | null;
  quotaMb: number | null;
}> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.estimate !== "function"
  ) {
    return { usageMb: null, quotaMb: null };
  }
  try {
    const e = await navigator.storage.estimate();
    return {
      usageMb: e.usage ? e.usage / (1024 * 1024) : null,
      quotaMb: e.quota ? e.quota / (1024 * 1024) : null,
    };
  } catch {
    return { usageMb: null, quotaMb: null };
  }
}
