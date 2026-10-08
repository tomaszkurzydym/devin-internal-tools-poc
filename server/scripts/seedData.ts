import type { DB } from "../core/db.js";
import { MODULES } from "../modules/index.js";

/** Synthetic demo users. Domain data is seeded by each module (see server/modules/index.ts). */
export const DEMO_USERS = [
  { id: "u_viewer", name: "Vera Viewer", email: "vera.viewer@example.test", role: "viewer" },
  { id: "u_reviewer", name: "Riley Reviewer", email: "riley.reviewer@example.test", role: "reviewer" },
  { id: "u_admin", name: "Ada Admin", email: "ada.admin@example.test", role: "admin" },
] as const;

function isoFrom(baseTime?: Date) {
  const base = (baseTime ?? new Date("2026-09-30T09:00:00Z")).getTime();
  return (offsetMinutes: number) => new Date(base + offsetMinutes * 60_000).toISOString();
}

export function seed(db: DB, opts: { baseTime?: Date } = {}): void {
  const iso = isoFrom(opts.baseTime);

  db.transaction(() => {
    const insertUser = db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)");
    for (const u of DEMO_USERS) insertUser.run(u.id, u.name, u.email, u.role);
    for (const m of MODULES) m.seed(db, iso);
  })();
}

/** Seeds whatever is missing: demo users on a new database, and any module whose tables are empty
 * (so a module added later gets its synthetic data without wiping an existing database). */
export function seedIfEmpty(db: DB, opts: { baseTime?: Date } = {}): boolean {
  const isEmpty = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n === 0;
  if (isEmpty("users")) {
    seed(db, opts);
    return true;
  }
  const missing = MODULES.filter((m) => m.tables.every(isEmpty));
  if (missing.length === 0) return false;
  const iso = isoFrom(opts.baseTime);
  db.transaction(() => missing.forEach((m) => m.seed(db, iso)))();
  return true;
}
