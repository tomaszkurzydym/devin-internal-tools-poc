import type { DB } from "../../core/db.js";
import { writeAuditEvent } from "../../core/audit.js";
import { REFUND_AUDIT_ACTIONS, REFUND_ENTITY } from "./types.js";

/** Synthetic data only: fictional customers, accounts and amounts. */
const CUSTOMERS = [
  "Amara Whitlock", "Benedikt Saar", "Cosima Draper", "Dmitri Albescu", "Esme Thornbury", "Farid Haddad",
  "Greta Holmqvist", "Hugo Lestrange", "Ines Carvalho", "Jonas Kettering", "Keiko Arai", "Leopold Vance",
  "Maren Ostby", "Nadia Kowalczyk", "Oskar Brandt", "Priya Raman", "Rafael Montoya", "Sanne de Wit",
];
const REASONS = ["duplicate_charge", "service_not_received", "card_fee_dispute", "subscription_cancelled", "goodwill"];
const CURRENCIES = ["GBP", "EUR", "PLN", "USD"];

export function seedRefunds(db: DB, iso: (offsetMinutes: number) => string): void {
  const insert = db.prepare(`
    INSERT INTO refund_requests
      (id, customer_name, account_ref, amount_minor, currency, reason, requested_at, status,
       reviewed_by, reviewed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  CUSTOMERS.forEach((name, i) => {
    const id = `RF-${2001 + i}`;
    const requestedAt = iso(-i * 7 * 60 - 15);
    const reviewed = i % 3 === 2;
    const reviewedAt = reviewed ? iso(-i * 7 * 60 + 120) : null;
    insert.run(
      id, name, `ACC-${(48210 + i * 37).toString()}`, 1250 + ((i * 7919) % 48000), CURRENCIES[i % CURRENCIES.length]!,
      REASONS[i % REASONS.length]!, requestedAt, reviewed ? "reviewed" : "pending",
      reviewed ? "u_reviewer" : null, reviewedAt, reviewedAt ?? requestedAt,
    );
    if (reviewed) {
      writeAuditEvent(db, {
        actorId: "u_reviewer", action: REFUND_AUDIT_ACTIONS.markedReviewed, entityType: REFUND_ENTITY, entityId: id,
        metadata: { previousStatus: "pending", newStatus: "reviewed", seeded: true },
      }, reviewedAt!);
    }
  });
}
