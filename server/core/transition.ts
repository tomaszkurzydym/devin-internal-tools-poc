import type { DB } from "./db.js";
import { nowUtc } from "./db.js";
import { conflict } from "./http.js";
import { writeAuditEvent, type AuditEventInput } from "./audit.js";

/**
 * Runs a guarded state change and its audit event in one IMMEDIATE transaction.
 * `update` must be a conditional UPDATE (`... WHERE id = ? AND status = ?`); if it changes
 * anything other than exactly one row the transaction rolls back with 409 and no audit event
 * is written, so stale or repeated requests cannot overwrite state or duplicate audit rows.
 * Domain modules own the SQL, transition table, validation and messages.
 */
export function guardedTransition<T>(
  db: DB,
  opts: {
    update: (now: string) => { changes: number };
    conflictMessage: () => string;
    audit: AuditEventInput;
    result: () => T;
  },
): T {
  const run = db.transaction(() => {
    const now = nowUtc();
    if (opts.update(now).changes !== 1) throw conflict(opts.conflictMessage());
    writeAuditEvent(db, opts.audit, now);
    return opts.result();
  });
  return run.immediate();
}
