// Browser-side macOS Contacts reader. Mirrors `src/lib/contacts.ts` exactly,
// except it reads AddressBook-v22.abcddb files from File objects (uploaded
// via a picker) rather than from the filesystem. Multiple Apple ID sources
// each ship their own .abcddb, so we accept many and merge into one map.
//
// Schema (post-Catalina):
//   ZABCDRECORD       — main records (Z_PK, ZFIRSTNAME, ZLASTNAME, ZORGANIZATION)
//   ZABCDPHONENUMBER  — phones (ZOWNER → record, ZFULLNUMBER)
//   ZABCDEMAILADDRESS — emails (ZOWNER → record, ZADDRESS)

import initSqlJs, { type SqlJsStatic } from "sql.js";

export type ContactName = {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
};

let cachedSql: SqlJsStatic | null = null;
async function getSql(): Promise<SqlJsStatic> {
  if (cachedSql) return cachedSql;
  cachedSql = await initSqlJs({ locateFile: (f) => `/${f}` });
  return cachedSql;
}

// Strip everything except digits. If 11 digits and starts with 1 (US country
// code), drop it. Returns the canonical 10-digit form (or whatever's left).
function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function buildFullName(c: {
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
}): string {
  const parts = [c.firstName, c.lastName].filter(
    (p): p is string => !!p && p.trim() !== "",
  );
  if (parts.length > 0) return parts.join(" ");
  if (c.organization && c.organization.trim() !== "") return c.organization;
  return "";
}

let nameMap: Map<string, ContactName> = new Map();

/**
 * Replace the in-memory contact map with names extracted from the given
 * AddressBook-v22.abcddb file bytes. Each Apple ID source has its own DB;
 * pass them all and we'll merge.
 */
export async function loadAddressBooks(
  files: { name: string; bytes: Uint8Array }[],
): Promise<{ filesProcessed: number; contactCount: number; warnings: string[] }> {
  const SQL = await getSql();
  const merged = new Map<string, ContactName>();
  const warnings: string[] = [];
  let processed = 0;

  for (const f of files) {
    let db: InstanceType<SqlJsStatic["Database"]>;
    try {
      db = new SQL.Database(f.bytes);
    } catch (err) {
      warnings.push(`couldn't open ${f.name}: ${String(err)}`);
      continue;
    }

    try {
      // Records: ZABCDRECORD
      const recordsStmt = db.prepare(
        `SELECT Z_PK AS id, ZFIRSTNAME AS firstName, ZLASTNAME AS lastName, ZORGANIZATION AS organization FROM ZABCDRECORD`,
      );
      const recordById = new Map<number, ContactName>();
      while (recordsStmt.step()) {
        const r = recordsStmt.getAsObject() as {
          id: number;
          firstName: string | null;
          lastName: string | null;
          organization: string | null;
        };
        const fullName = buildFullName(r);
        if (!fullName) continue;
        recordById.set(r.id, {
          fullName,
          firstName: r.firstName,
          lastName: r.lastName,
          organization: r.organization,
        });
      }
      recordsStmt.free();

      // Phones
      const phoneStmt = db.prepare(
        `SELECT ZOWNER AS ownerId, ZFULLNUMBER AS phone FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL`,
      );
      while (phoneStmt.step()) {
        const p = phoneStmt.getAsObject() as { ownerId: number; phone: string };
        const name = recordById.get(p.ownerId);
        if (!name) continue;
        const norm = normalizePhone(p.phone);
        if (norm.length >= 7) merged.set(norm, name);
      }
      phoneStmt.free();

      // Emails
      const emailStmt = db.prepare(
        `SELECT ZOWNER AS ownerId, ZADDRESS AS email FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL`,
      );
      while (emailStmt.step()) {
        const e = emailStmt.getAsObject() as { ownerId: number; email: string };
        const name = recordById.get(e.ownerId);
        if (!name) continue;
        merged.set(e.email.toLowerCase(), name);
      }
      emailStmt.free();
      processed++;
    } catch (err) {
      warnings.push(`error querying ${f.name}: ${String(err)}`);
    } finally {
      db.close();
    }
  }

  nameMap = merged;
  return { filesProcessed: processed, contactCount: merged.size, warnings };
}

/** Lookup a phone or email identifier (as stored in chat.db's `handle.id`). */
export function resolveContactName(identifier: string): ContactName | null {
  if (nameMap.size === 0) return null;
  if (identifier.includes("@")) {
    return nameMap.get(identifier.toLowerCase()) ?? null;
  }
  const norm = normalizePhone(identifier);
  if (norm.length < 7) return null;
  return nameMap.get(norm) ?? null;
}

/** True once at least one AddressBook has been loaded. */
export function isContactsLoaded(): boolean {
  return nameMap.size > 0;
}

export function contactsCount(): number {
  return nameMap.size;
}
