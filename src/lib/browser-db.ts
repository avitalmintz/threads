// Browser-side iMessage chat.db reader. Mirrors the API of `chat-db.ts` but
// runs entirely in the browser via sql.js (WebAssembly SQLite). The chat.db
// file is loaded once into memory; queries are synchronous after init.
//
// Why this exists: making "threads" publishable requires moving SQLite off
// the server (we can't ship a 10GB chat.db to Vercel; users keep their data).
// sql.js + OPFS lets us read the user's chat.db locally without leaving
// their browser.
//
// Schema is identical to the server-side version (it's the same chat.db).
// Apple's date format: nanoseconds since 2001-01-01 UTC.

import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";
import { resolveContactName as resolveContact } from "./browser-contacts";

const APPLE_EPOCH_OFFSET_SEC = 978307200;

// ─────────────────────────────────────────────────────────────────────────────
// Types — identical to chat-db.ts so swapping is mechanical.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatHandle = {
  id: number;
  identifier: string;
};

export type ChatDatabaseStats = {
  handleCount: number;
  chatCount: number;
  messageCount: number;
  earliestMessage: Date | null;
  latestMessage: Date | null;
};

export type HandleSummary = {
  handle: ChatHandle;
  contactName: string | null;
  displayName: string;
  totalMessages: number;
  messagesFromMe: number;
  messagesFromThem: number;
  earliest: Date | null;
  latest: Date | null;
  recent30: number;
  recent90: number;
  recent365: number;
};

export type SearchHit = {
  date: Date;
  isFromMe: boolean;
  text: string;
  contactName: string | null;
  identifier: string;
};

export type RankedContact = {
  identifier: string;
  contactName: string | null;
  displayName: string;
  totalMessages: number;
  messagesFromMe: number;
  messagesFromThem: number;
};

export type TextureStats = {
  heatmap: number[][];
  peakHour: number;
  peakHourCount: number;
  peakDay: number;
  peakDayCount: number;
  longestStreakDays: number;
  longestGapDays: number;
  longestGapStart: Date | null;
  longestGapEnd: Date | null;
  medianResponseSeconds: number | null;
  initiationsByMe: number;
  initiationsByThem: number;
};

export type HandleDetail = {
  handle: ChatHandle;
  contactName: string | null;
  displayName: string;
  totalMessages: number;
  messagesFromMe: number;
  messagesFromThem: number;
  earliest: Date | null;
  latest: Date | null;
  monthlyCounts: { yearMonth: string; count: number }[];
  recentMessages: { date: Date; isFromMe: boolean; text: string }[];
};

export type SamplingMode = "recent" | "stratified" | "auto";

// ─────────────────────────────────────────────────────────────────────────────
// Apple-epoch conversion helpers (verbatim from chat-db.ts).
// ─────────────────────────────────────────────────────────────────────────────

function appleDateToJsDate(appleNs: number | bigint): Date {
  const n = typeof appleNs === "bigint" ? Number(appleNs) : appleNs;
  const seconds = n > 1e12 ? n / 1e9 : n;
  return new Date((seconds + APPLE_EPOCH_OFFSET_SEC) * 1000);
}

function jsDateToAppleSeconds(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getTime() / 1000 - APPLE_EPOCH_OFFSET_SEC;
}

// ─────────────────────────────────────────────────────────────────────────────
// sql.js initialization + thin better-sqlite3-style wrapper.
//
// We expose `prepare(sql).all(args)` / `prepare(sql).get(args)` that read like
// the server-side code. Internally we run sql.js's bind+step loop. Keys in
// named-param objects get a `:` prefix unless they already have one — sql.js
// requires the prefix in the binding key, while better-sqlite3 strips it. To
// avoid translating SQL strings we keep `@name` placeholders working by
// mapping object keys `name` → `@name` when the SQL contains `@name`.
// ─────────────────────────────────────────────────────────────────────────────

let sqlStatic: SqlJsStatic | null = null;
let cachedDb: SqlJsDatabase | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlStatic) return sqlStatic;
  sqlStatic = await initSqlJs({
    // sql-wasm.wasm is copied to /public during setup. Served as a static
    // asset by Next.js — same origin, no CORS dance needed.
    locateFile: (file) => `/${file}`,
  });
  return sqlStatic;
}

/**
 * Initialize the in-memory database from a Uint8Array (raw chat.db bytes).
 * Call once after the user uploads / loads a file from OPFS. Subsequent
 * query calls reuse the cached connection.
 *
 * Throws a clear error if the file isn't a chat.db — usually because the
 * user picked an AddressBook .abcddb (also SQLite) by mistake.
 */
export async function openBrowserDb(bytes: Uint8Array): Promise<void> {
  const SQL = await loadSqlJs();
  if (cachedDb) cachedDb.close();
  cachedDb = new SQL.Database(bytes);

  // Sanity check: a real chat.db has `handle`, `message`, `chat`. An
  // AddressBook-v22.abcddb has ZABCDRECORD instead. Catch the mix-up here
  // with a useful error rather than letting it surface deep inside a query.
  const tables = cachedDb
    .exec("SELECT name FROM sqlite_master WHERE type='table'")
    .at(0)
    ?.values.map((r) => String(r[0])) ?? [];
  const missing = ["handle", "message", "chat"].filter(
    (t) => !tables.includes(t),
  );
  if (missing.length > 0) {
    cachedDb.close();
    cachedDb = null;
    if (tables.some((t) => t.startsWith("ZABCD"))) {
      throw new Error(
        "this looks like an AddressBook file, not chat.db. pick chat.db (the file directly inside ~/Desktop/threads-data/, or in ~/Library/Messages/).",
      );
    }
    throw new Error(
      `this doesn't look like an iMessage chat.db — missing tables: ${missing.join(", ")}. pick the chat.db file from ~/Library/Messages/.`,
    );
  }
}

/** True if a database has been opened. */
export function isOpen(): boolean {
  return cachedDb !== null;
}

/** Close + free the underlying WASM resources. */
export function closeBrowserDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
}

function db(): SqlJsDatabase {
  if (!cachedDb) {
    throw new Error("Browser DB not initialized. Call openBrowserDb(bytes) first.");
  }
  return cachedDb;
}

type ParamValue = string | number | bigint | Uint8Array | null;
type NamedParams = Record<string, ParamValue>;

function preparePlaceholders(sql: string, named: NamedParams): NamedParams {
  // Convert `name: v` → `@name: v` (or `:name`/`$name`) based on which prefix
  // appears in the SQL. better-sqlite3 strips the prefix; sql.js requires it.
  const out: NamedParams = {};
  for (const [k, v] of Object.entries(named)) {
    if (k.startsWith("@") || k.startsWith(":") || k.startsWith("$")) {
      out[k] = v;
      continue;
    }
    if (sql.includes(`@${k}`)) out[`@${k}`] = v;
    else if (sql.includes(`:${k}`)) out[`:${k}`] = v;
    else if (sql.includes(`$${k}`)) out[`$${k}`] = v;
    else out[`@${k}`] = v; // default fallback
  }
  return out;
}

class Stmt {
  constructor(private sql: string) {}

  /** Run the query and return all rows as plain objects. */
  all<T = Record<string, unknown>>(...args: unknown[]): T[] {
    const stmt = db().prepare(this.sql);
    try {
      this.bind(stmt, args);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** Run the query and return the first row (or undefined). */
  get<T = Record<string, unknown>>(...args: unknown[]): T | undefined {
    const stmt = db().prepare(this.sql);
    try {
      this.bind(stmt, args);
      if (stmt.step()) return stmt.getAsObject() as T;
      return undefined;
    } finally {
      stmt.free();
    }
  }

  private bind(
    stmt: ReturnType<SqlJsDatabase["prepare"]>,
    args: unknown[],
  ): void {
    if (args.length === 0) return;
    // Single object arg → named binding
    const first = args[0];
    if (
      args.length === 1 &&
      first !== null &&
      typeof first === "object" &&
      !Array.isArray(first) &&
      !(first instanceof Uint8Array)
    ) {
      const named = preparePlaceholders(this.sql, first as NamedParams);
      // sql.js's bind takes a Record<string, ParamValue> but the @types say
      // BindParams which is a tagged type. Cast through unknown.
      stmt.bind(named as unknown as Parameters<typeof stmt.bind>[0]);
      return;
    }
    // Otherwise positional — pass the array straight through
    stmt.bind(args as unknown as Parameters<typeof stmt.bind>[0]);
  }
}

function prepare(sql: string): Stmt {
  return new Stmt(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query API — port of chat-db.ts. Contact-name resolution stays separate
// (handled by an in-browser AddressBook reader, ported in a later step).
// For now `contactName` is always null and `displayName` is the identifier.
// ─────────────────────────────────────────────────────────────────────────────

// Delegate to browser-contacts, which builds the name map from one or more
// AddressBook-v22.abcddb files the user uploaded. Returns null if the user
// hasn't uploaded any AddressBook yet — in which case displayName falls back
// to the raw phone/email, same as on the server when no AddressBook is found.
function resolveContactNameStub(identifier: string): { fullName: string } | null {
  return resolveContact(identifier);
}

export function getStats(): ChatDatabaseStats {
  const handleCount = (prepare("SELECT COUNT(*) AS c FROM handle").get<{ c: number }>())!.c;
  const chatCount = (prepare("SELECT COUNT(*) AS c FROM chat").get<{ c: number }>())!.c;
  const messageCount = (prepare("SELECT COUNT(*) AS c FROM message").get<{ c: number }>())!.c;
  const range = prepare(
    "SELECT MIN(date) AS minD, MAX(date) AS maxD FROM message WHERE date IS NOT NULL",
  ).get<{ minD: number | null; maxD: number | null }>()!;
  return {
    handleCount,
    chatCount,
    messageCount,
    earliestMessage: range.minD ? appleDateToJsDate(range.minD) : null,
    latestMessage: range.maxD ? appleDateToJsDate(range.maxD) : null,
  };
}

export function getAllHandles(): ChatHandle[] {
  return prepare("SELECT ROWID AS id, id AS identifier FROM handle WHERE id IS NOT NULL").all<
    ChatHandle
  >();
}

export function getHandleSummaries(): HandleSummary[] {
  const now = Date.now();
  const cutoff30 = (now - 30 * 86400 * 1000) / 1000 - APPLE_EPOCH_OFFSET_SEC;
  const cutoff90 = (now - 90 * 86400 * 1000) / 1000 - APPLE_EPOCH_OFFSET_SEC;
  const cutoff365 = (now - 365 * 86400 * 1000) / 1000 - APPLE_EPOCH_OFFSET_SEC;

  const stats = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    attribution AS (
      SELECT cs.solo_handle AS handleId, m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1

      UNION ALL

      SELECT m.handle_id AS handleId, m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1
        AND m.is_from_me = 0
        AND m.handle_id IS NOT NULL
    )
    SELECT
      h.ROWID AS handleId,
      h.id AS identifier,
      COUNT(*) AS total,
      SUM(CASE WHEN a.is_from_me = 1 THEN 1 ELSE 0 END) AS fromMe,
      MIN(a.date) AS minD,
      MAX(a.date) AS maxD,
      SUM(CASE WHEN a.date IS NOT NULL AND (
        (a.date > 1e12 AND a.date / 1e9 > @c30) OR (a.date <= 1e12 AND a.date > @c30)
      ) THEN 1 ELSE 0 END) AS recent30,
      SUM(CASE WHEN a.date IS NOT NULL AND (
        (a.date > 1e12 AND a.date / 1e9 > @c90) OR (a.date <= 1e12 AND a.date > @c90)
      ) THEN 1 ELSE 0 END) AS recent90,
      SUM(CASE WHEN a.date IS NOT NULL AND (
        (a.date > 1e12 AND a.date / 1e9 > @c365) OR (a.date <= 1e12 AND a.date > @c365)
      ) THEN 1 ELSE 0 END) AS recent365
    FROM attribution a
    JOIN handle h ON h.ROWID = a.handleId
    WHERE h.id IS NOT NULL
    GROUP BY h.ROWID
    `,
  ).all<{
    handleId: number;
    identifier: string;
    total: number;
    fromMe: number;
    minD: number | null;
    maxD: number | null;
    recent30: number;
    recent90: number;
    recent365: number;
  }>({ c30: cutoff30, c90: cutoff90, c365: cutoff365 });

  return stats
    .map((s) => {
      const contact = resolveContactNameStub(s.identifier);
      const contactName = contact?.fullName ?? null;
      return {
        handle: { id: s.handleId, identifier: s.identifier },
        contactName,
        displayName: contactName ?? s.identifier,
        totalMessages: s.total,
        messagesFromMe: s.fromMe,
        messagesFromThem: s.total - s.fromMe,
        earliest: s.minD ? appleDateToJsDate(s.minD) : null,
        latest: s.maxD ? appleDateToJsDate(s.maxD) : null,
        recent30: s.recent30,
        recent90: s.recent90,
        recent365: s.recent365,
      };
    })
    .sort((a, b) => b.totalMessages - a.totalMessages);
}

export function searchMessages(
  keywords: string[],
  options: {
    contactFilter?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  } = {},
): SearchHit[] {
  if (keywords.length === 0) return [];
  const limit = Math.min(options.limit ?? 50, 200);

  const trimmed = keywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2);
  if (trimmed.length === 0) return [];

  const likeClauses = trimmed.map(() => "LOWER(m.text) LIKE ?").join(" OR ");
  const params: ParamValue[] = trimmed.map((k) => `%${k}%`);

  let contactClause = "";
  if (options.contactFilter && options.contactFilter.trim()) {
    contactClause = " AND (h.id LIKE ? OR LOWER(h.id) LIKE ?)";
    const f = options.contactFilter.trim();
    params.push(`%${f}%`, `%${f.toLowerCase()}%`);
  }

  let dateClause = "";
  if (options.startDate) {
    const start = jsDateToAppleSeconds(options.startDate);
    dateClause +=
      " AND ((m.date > 1e12 AND m.date / 1e9 >= ?) OR (m.date <= 1e12 AND m.date >= ?))";
    params.push(start, start);
  }
  if (options.endDate) {
    const end = jsDateToAppleSeconds(options.endDate) + 86400;
    dateClause +=
      " AND ((m.date > 1e12 AND m.date / 1e9 <= ?) OR (m.date <= 1e12 AND m.date <= ?))";
    params.push(end, end);
  }

  const sql = `
    SELECT
      m.date AS rawDate,
      m.is_from_me AS isFromMe,
      m.text AS text,
      h.id AS identifier
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
    JOIN handle h ON h.ROWID = chj.handle_id
    WHERE m.text IS NOT NULL
      AND m.text != ''
      AND (${likeClauses})${contactClause}${dateClause}
    ORDER BY m.date DESC
    LIMIT ${limit}
  `;

  const rows = prepare(sql).all<{
    rawDate: number;
    isFromMe: number;
    text: string;
    identifier: string;
  }>(...params);

  return rows.map((r) => ({
    date: appleDateToJsDate(r.rawDate),
    isFromMe: !!r.isFromMe,
    text: r.text,
    contactName: resolveContactNameStub(r.identifier)?.fullName ?? null,
    identifier: r.identifier,
  }));
}

export function rankContactsInRange(
  startDate: string,
  endDate: string,
  limit = 20,
): RankedContact[] {
  const start = jsDateToAppleSeconds(startDate);
  const end = jsDateToAppleSeconds(endDate) + 86400;

  const rows = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    attribution AS (
      SELECT cs.solo_handle AS handleId, m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1
        AND m.date IS NOT NULL
        AND ((m.date > 1e12 AND m.date / 1e9 >= @start AND m.date / 1e9 <= @end)
             OR (m.date <= 1e12 AND m.date >= @start AND m.date <= @end))
      UNION ALL
      SELECT m.handle_id AS handleId, m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1
        AND m.is_from_me = 0
        AND m.handle_id IS NOT NULL
        AND m.date IS NOT NULL
        AND ((m.date > 1e12 AND m.date / 1e9 >= @start AND m.date / 1e9 <= @end)
             OR (m.date <= 1e12 AND m.date >= @start AND m.date <= @end))
    )
    SELECT
      h.id AS identifier,
      COUNT(*) AS total,
      SUM(CASE WHEN a.is_from_me = 1 THEN 1 ELSE 0 END) AS fromMe
    FROM attribution a
    JOIN handle h ON h.ROWID = a.handleId
    WHERE h.id IS NOT NULL
    GROUP BY h.ROWID
    ORDER BY total DESC
    LIMIT ${Math.max(1, Math.min(limit, 50))}
    `,
  ).all<{
    identifier: string;
    total: number;
    fromMe: number;
  }>({ start, end });

  return rows.map((r) => {
    const contact = resolveContactNameStub(r.identifier);
    const contactName = contact?.fullName ?? null;
    return {
      identifier: r.identifier,
      contactName,
      displayName: contactName ?? r.identifier,
      totalMessages: r.total,
      messagesFromMe: r.fromMe,
      messagesFromThem: r.total - r.fromMe,
    };
  });
}

export function findContactsByQuery(query: string, limit = 5): HandleSummary[] {
  const summaries = getHandleSummaries();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  return summaries
    .filter((s) => {
      if (s.handle.identifier.toLowerCase().includes(q)) return true;
      if (s.contactName && s.contactName.toLowerCase().includes(q)) return true;
      return false;
    })
    .slice(0, limit);
}

export function getRecentMessagesByHandle(
  handleIds: number[],
  perHandleLimit = 30,
): Map<number, { date: Date; isFromMe: boolean; text: string }[]> {
  if (handleIds.length === 0) return new Map();

  const placeholders = handleIds.map(() => "?").join(",");
  const rows = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    person_msgs AS (
      SELECT cs.solo_handle AS handleId, m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1 AND m.text IS NOT NULL AND m.text != ''
      UNION ALL
      SELECT m.handle_id AS handleId, m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1
        AND m.is_from_me = 0
        AND m.handle_id IS NOT NULL
        AND m.text IS NOT NULL AND m.text != ''
    ),
    bucketed AS (
      SELECT
        handleId, rawDate, isFromMe, text,
        NTILE(${perHandleLimit}) OVER (PARTITION BY handleId ORDER BY rawDate ASC) AS bucket
      FROM person_msgs
      WHERE handleId IN (${placeholders})
    ),
    one_per_bucket AS (
      SELECT
        handleId, rawDate, isFromMe, text, bucket,
        ROW_NUMBER() OVER (PARTITION BY handleId, bucket ORDER BY rawDate ASC) AS bucket_rn
      FROM bucketed
    )
    SELECT handleId, rawDate, isFromMe, text FROM one_per_bucket
    WHERE bucket_rn = 1
    ORDER BY handleId, rawDate ASC
    `,
  ).all<{
    handleId: number;
    rawDate: number;
    isFromMe: number;
    text: string;
  }>(...handleIds);

  const result = new Map<number, { date: Date; isFromMe: boolean; text: string }[]>();
  for (const r of rows) {
    if (!result.has(r.handleId)) result.set(r.handleId, []);
    result.get(r.handleId)!.push({
      date: appleDateToJsDate(r.rawDate),
      isFromMe: !!r.isFromMe,
      text: r.text,
    });
  }
  return result;
}

export function getTextureStats(handleId: number): TextureStats {
  const rows = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    attribution AS (
      SELECT m.date AS rawDate, m.is_from_me AS isFromMe
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1 AND cs.solo_handle = ?
        AND m.date IS NOT NULL
      UNION ALL
      SELECT m.date AS rawDate, m.is_from_me AS isFromMe
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1 AND m.handle_id = ? AND m.is_from_me = 0
        AND m.date IS NOT NULL
    )
    SELECT rawDate, isFromMe FROM attribution ORDER BY rawDate ASC
    `,
  ).all<{ rawDate: number; isFromMe: number }>(handleId, handleId);

  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  let lastDateMs: number | null = null;
  let lastIsFromMe: number | null = null;
  let longestGapMs = 0;
  let longestGapStart: Date | null = null;
  let longestGapEnd: Date | null = null;
  const responseTimes: number[] = [];
  let initiationsByMe = 0;
  let initiationsByThem = 0;
  const SIX_HOURS_MS = 6 * 3600 * 1000;
  const ONE_DAY_MS = 86400 * 1000;
  const TWO_HOURS_MS = 2 * 3600 * 1000;

  const messageDays = new Set<string>();

  for (const r of rows) {
    const d = appleDateToJsDate(r.rawDate);
    const ms = d.getTime();
    const dayOfWeek = d.getDay();
    const hour = d.getHours();
    heatmap[dayOfWeek][hour]++;

    const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    messageDays.add(dayKey);

    if (lastDateMs !== null) {
      const gap = ms - lastDateMs;

      if (gap > longestGapMs) {
        longestGapMs = gap;
        longestGapStart = new Date(lastDateMs);
        longestGapEnd = d;
      }

      if (lastIsFromMe !== null && lastIsFromMe !== r.isFromMe && gap < TWO_HOURS_MS) {
        responseTimes.push(gap / 1000);
      }

      if (gap > SIX_HOURS_MS) {
        if (r.isFromMe) initiationsByMe++;
        else initiationsByThem++;
      }
    }

    lastDateMs = ms;
    lastIsFromMe = r.isFromMe;
  }

  const dayTotals = heatmap.map((row) => row.reduce((sum, count) => sum + count, 0));
  let peakDay = 0;
  let peakDayCount = 0;
  for (let d = 0; d < 7; d++) {
    if (dayTotals[d] > peakDayCount) {
      peakDayCount = dayTotals[d];
      peakDay = d;
    }
  }

  const hourTotals = Array(24).fill(0);
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) hourTotals[h] += heatmap[d][h];
  let peakHour = 0;
  let peakHourCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourTotals[h] > peakHourCount) {
      peakHourCount = hourTotals[h];
      peakHour = h;
    }
  }

  const sortedDays = [...messageDays]
    .map((s) => {
      const [y, mo, d] = s.split("-").map(Number);
      return new Date(y, mo - 1, d).getTime();
    })
    .sort((a, b) => a - b);

  let longestStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0 || sortedDays[i] - sortedDays[i - 1] === ONE_DAY_MS) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  let medianResponseSeconds: number | null = null;
  if (responseTimes.length > 0) {
    const sorted = [...responseTimes].sort((a, b) => a - b);
    medianResponseSeconds = sorted[Math.floor(sorted.length / 2)];
  }

  return {
    heatmap,
    peakHour,
    peakHourCount,
    peakDay,
    peakDayCount,
    longestStreakDays: longestStreak,
    longestGapDays: Math.floor(longestGapMs / ONE_DAY_MS),
    longestGapStart,
    longestGapEnd,
    medianResponseSeconds,
    initiationsByMe,
    initiationsByThem,
  };
}

/**
 * Diagnostic message counts for one contact, broken down by where the
 * messages live:
 *   - oneOnOneWithText: private 1:1 messages with non-empty text (the
 *     scope used by deep dive, texture summary, striking moments, etc.)
 *   - oneOnOneNoText: private 1:1 attachments / reactions / link previews
 *     where text is empty. Inflates "total" but isn't usable for AI.
 *   - groupChatFromThem: messages this contact sent in group chats. Big
 *     for people you mostly group-chat with.
 *
 * COUNT(DISTINCT handle_id) defends against rare chat_handle_join
 * duplicate-row cases that would otherwise misclassify a 1:1 as a group.
 */
export function getMessageBreakdown(handleId: number): {
  oneOnOneWithText: number;
  oneOnOneNoText: number;
  groupChatFromThem: number;
} {
  const row = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(DISTINCT handle_id) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    )
    SELECT
      SUM(CASE
        WHEN cs.sz = 1 AND cs.solo_handle = ?
          AND m.text IS NOT NULL AND m.text != ''
        THEN 1 ELSE 0 END) AS oneOnOneWithText,
      SUM(CASE
        WHEN cs.sz = 1 AND cs.solo_handle = ?
          AND (m.text IS NULL OR m.text = '')
        THEN 1 ELSE 0 END) AS oneOnOneNoText,
      SUM(CASE
        WHEN cs.sz > 1 AND m.handle_id = ? AND m.is_from_me = 0
        THEN 1 ELSE 0 END) AS groupChatFromThem
    FROM message m
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat_size cs ON cs.chat_id = cmj.chat_id
    `,
  ).get<{
    oneOnOneWithText: number | null;
    oneOnOneNoText: number | null;
    groupChatFromThem: number | null;
  }>(handleId, handleId, handleId);
  return {
    oneOnOneWithText: row?.oneOnOneWithText ?? 0,
    oneOnOneNoText: row?.oneOnOneNoText ?? 0,
    groupChatFromThem: row?.groupChatFromThem ?? 0,
  };
}

/** Convenience wrapper for callers that only want the 1:1-with-text count. */
export function getOneOnOneMessageCount(handleId: number): number {
  return getMessageBreakdown(handleId).oneOnOneWithText;
}

export function getAllMessagesForHandle(
  handleId: number,
  oneOnOneOnly = false,
): { date: Date; isFromMe: boolean; text: string }[] {
  // For "how does this person talk to me" type questions, group-chat
  // messages are misleading — they're addressed to whoever's in the group,
  // not necessarily the user. Pass oneOnOneOnly=true to scope to private
  // chats only.
  const sql = oneOnOneOnly
    ? `
      WITH chat_size AS (
        -- COUNT(DISTINCT) defends against rare cases where chat_handle_join
        -- has duplicate (chat_id, handle_id) rows, which would otherwise
        -- mis-classify a 1:1 chat as a group chat.
        SELECT chat_id, COUNT(DISTINCT handle_id) AS sz, MIN(handle_id) AS solo_handle
        FROM chat_handle_join
        GROUP BY chat_id
      )
      SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1 AND cs.solo_handle = ?
        AND m.text IS NOT NULL AND m.text != ''
      ORDER BY rawDate ASC
    `
    : `
      WITH chat_size AS (
        -- COUNT(DISTINCT) defends against rare cases where chat_handle_join
        -- has duplicate (chat_id, handle_id) rows, which would otherwise
        -- mis-classify a 1:1 chat as a group chat.
        SELECT chat_id, COUNT(DISTINCT handle_id) AS sz, MIN(handle_id) AS solo_handle
        FROM chat_handle_join
        GROUP BY chat_id
      ),
      attribution AS (
        SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_size cs ON cs.chat_id = cmj.chat_id
        WHERE cs.sz = 1 AND cs.solo_handle = ?
          AND m.text IS NOT NULL AND m.text != ''
        UNION ALL
        SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_size cs ON cs.chat_id = cmj.chat_id
        WHERE cs.sz > 1
          AND m.handle_id = ?
          AND m.is_from_me = 0
          AND m.text IS NOT NULL AND m.text != ''
      )
      SELECT rawDate, isFromMe, text FROM attribution ORDER BY rawDate ASC
    `;

  const rows = oneOnOneOnly
    ? prepare(sql).all<{ rawDate: number; isFromMe: number; text: string }>(handleId)
    : prepare(sql).all<{ rawDate: number; isFromMe: number; text: string }>(handleId, handleId);

  return rows.map((r) => ({
    date: appleDateToJsDate(r.rawDate),
    isFromMe: !!r.isFromMe,
    text: r.text,
  }));
}

export function getHandleDetail(
  handleId: number,
  limit = 50,
  modeOrStratified: SamplingMode | boolean = false,
  // When true, the recentMessages array is restricted to 1:1 messages only —
  // the right scope for "how does this person talk to me" AI analyses.
  // Group-chat messages from this contact are excluded because they're
  // addressed to whoever's in the group, not the user. Stats (totalMessages,
  // monthlyCounts, etc.) are unchanged either way.
  oneOnOneOnly = false,
): HandleDetail | null {
  const mode: SamplingMode =
    typeof modeOrStratified === "boolean"
      ? modeOrStratified
        ? "stratified"
        : "recent"
      : modeOrStratified;

  const h = prepare(
    "SELECT ROWID AS id, id AS identifier FROM handle WHERE ROWID = ?",
  ).get<{ id: number; identifier: string }>(handleId);
  if (!h) return null;

  const stats = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    attribution AS (
      SELECT m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1 AND cs.solo_handle = ?
      UNION ALL
      SELECT m.is_from_me, m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1
        AND m.handle_id = ?
        AND m.is_from_me = 0
    )
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_from_me = 1 THEN 1 ELSE 0 END) AS fromMe,
      MIN(date) AS minD,
      MAX(date) AS maxD
    FROM attribution
    `,
  ).get<{
    total: number;
    fromMe: number;
    minD: number | null;
    maxD: number | null;
  }>(handleId, handleId)!;

  const monthlyRows = prepare(
    `
    WITH chat_size AS (
      SELECT chat_id, COUNT(*) AS sz, MIN(handle_id) AS solo_handle
      FROM chat_handle_join
      GROUP BY chat_id
    ),
    attribution AS (
      SELECT m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz = 1 AND cs.solo_handle = ?
      UNION ALL
      SELECT m.date
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_size cs ON cs.chat_id = cmj.chat_id
      WHERE cs.sz > 1
        AND m.handle_id = ?
        AND m.is_from_me = 0
    )
    SELECT date AS rawDate, COUNT(*) AS c
    FROM attribution
    WHERE date IS NOT NULL
    GROUP BY strftime(
      '%Y-%m',
      datetime(
        (CASE WHEN date > 1e12 THEN date / 1e9 ELSE date END) + 978307200,
        'unixepoch'
      )
    )
    `,
  ).all<{ rawDate: number; c: number }>(handleId, handleId);

  const byMonth = new Map<string, number>();
  for (const r of monthlyRows) {
    const d = appleDateToJsDate(r.rawDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + r.c);
  }
  const monthlyCounts = [...byMonth.entries()]
    .map(([yearMonth, count]) => ({ yearMonth, count }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  const baseAttribution = oneOnOneOnly
    ? `
      WITH chat_size AS (
        -- COUNT(DISTINCT) defends against rare cases where chat_handle_join
        -- has duplicate (chat_id, handle_id) rows, which would otherwise
        -- mis-classify a 1:1 chat as a group chat.
        SELECT chat_id, COUNT(DISTINCT handle_id) AS sz, MIN(handle_id) AS solo_handle
        FROM chat_handle_join
        GROUP BY chat_id
      ),
      attribution AS (
        SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_size cs ON cs.chat_id = cmj.chat_id
        WHERE cs.sz = 1 AND cs.solo_handle = ?
          AND m.text IS NOT NULL AND m.text != ''
      )
    `
    : `
      WITH chat_size AS (
        -- COUNT(DISTINCT) defends against rare cases where chat_handle_join
        -- has duplicate (chat_id, handle_id) rows, which would otherwise
        -- mis-classify a 1:1 chat as a group chat.
        SELECT chat_id, COUNT(DISTINCT handle_id) AS sz, MIN(handle_id) AS solo_handle
        FROM chat_handle_join
        GROUP BY chat_id
      ),
      attribution AS (
        SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_size cs ON cs.chat_id = cmj.chat_id
        WHERE cs.sz = 1 AND cs.solo_handle = ?
          AND m.text IS NOT NULL AND m.text != ''
        UNION ALL
        SELECT m.date AS rawDate, m.is_from_me AS isFromMe, m.text AS text
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat_size cs ON cs.chat_id = cmj.chat_id
        WHERE cs.sz > 1
          AND m.handle_id = ?
          AND m.is_from_me = 0
          AND m.text IS NOT NULL AND m.text != ''
      )
    `;

  let effectiveMode: "recent" | "stratified" = mode === "stratified" ? "stratified" : "recent";
  let effectiveLimit = limit;
  if (mode === "auto") {
    if (stats.total <= limit) {
      effectiveMode = "recent";
      effectiveLimit = stats.total + 50;
    } else {
      effectiveMode = "stratified";
    }
  }
  const stratified = effectiveMode === "stratified";

  let recent: { rawDate: number; isFromMe: number; text: string }[];

  // Bind args depend on oneOnOneOnly: that mode has one `?` for handleId,
  // the default has two (one for the 1:1 branch, one for the group-chat branch).
  const idArgs = oneOnOneOnly ? [handleId] : [handleId, handleId];

  if (stratified) {
    recent = prepare(
      `
      ${baseAttribution},
      bucketed AS (
        SELECT *, NTILE(?) OVER (ORDER BY rawDate ASC) AS bucket
        FROM attribution
      ),
      one_per_bucket AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY rawDate ASC) AS bucket_rn
        FROM bucketed
      )
      SELECT rawDate, isFromMe, text FROM one_per_bucket
      WHERE bucket_rn = 1
      ORDER BY rawDate ASC
      `,
    ).all<{ rawDate: number; isFromMe: number; text: string }>(
      ...idArgs,
      effectiveLimit,
    );
  } else {
    recent = prepare(
      `${baseAttribution}
       SELECT rawDate, isFromMe, text FROM attribution
       ORDER BY rawDate DESC
       LIMIT ?`,
    ).all<{ rawDate: number; isFromMe: number; text: string }>(
      ...idArgs,
      effectiveLimit,
    );
  }

  const recentMessages = recent
    .map((r) => ({
      date: appleDateToJsDate(r.rawDate),
      isFromMe: !!r.isFromMe,
      text: r.text,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const contact = resolveContactNameStub(h.identifier);
  return {
    handle: { id: h.id, identifier: h.identifier },
    contactName: contact?.fullName ?? null,
    displayName: contact?.fullName ?? h.identifier,
    totalMessages: stats.total,
    messagesFromMe: stats.fromMe,
    messagesFromThem: stats.total - stats.fromMe,
    earliest: stats.minD ? appleDateToJsDate(stats.minD) : null,
    latest: stats.maxD ? appleDateToJsDate(stats.maxD) : null,
    monthlyCounts,
    recentMessages,
  };
}
