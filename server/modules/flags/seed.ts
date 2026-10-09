import type { DB } from "../../core/db.js";
import { writeAuditEvent } from "../../core/audit.js";
import { FLAG_AUDIT_ACTIONS, FLAG_ENTITY, FLAG_ENVIRONMENT, type FlagStatus, type OwnerTeam } from "./types.js";

/** Synthetic flags only. A non-null reason means the flag was last changed by an admin (seeded audit event). */
const FLAGS: Array<[key: string, name: string, description: string, team: OwnerTeam, status: FlagStatus, reason: string | null]> = [
  ["payments.instant_payouts", "Instant payouts", "Route eligible payouts through the instant payment rail.", "payments", "disabled", null],
  ["payments.fx_quotes_v2", "FX quote engine v2", "Serve FX quotes from the v2 pricing service.", "payments", "enabled", "Canary review passed; rolling out to all customers."],
  ["onboarding.selfie_liveness", "Selfie liveness check", "Ask new applicants for a liveness selfie during sign-up.", "onboarding", "enabled", "Vendor sandbox sign-off received."],
  ["onboarding.address_autocomplete", "Address autocomplete", "Suggest postal addresses during sign-up.", "onboarding", "disabled", "Disabled after elevated sign-up error rate."],
  ["cards.virtual_cards", "Virtual cards", "Allow customers to issue virtual cards.", "cards", "enabled", null],
  ["cards.spend_controls_v2", "Spend controls v2", "Merchant-category spend limits for card holders.", "cards", "disabled", null],
  ["lending.prequalification", "Loan pre-qualification", "Soft-check pre-qualification flow for personal loans.", "lending", "disabled", null],
  ["lending.repayment_reminders", "Repayment reminders", "Push reminders three days before a repayment is due.", "lending", "enabled", "Approved by lending operations."],
  ["platform.reports_read_replica", "Reports from read replica", "Serve back-office reports from the read replica.", "platform", "enabled", null],
  ["platform.maintenance_banner", "Maintenance banner", "Show the scheduled-maintenance banner in customer apps.", "platform", "disabled", "Maintenance window finished."],
  ["payments.sepa_instant", "SEPA Instant transfers", "Offer instant transfers for eligible EUR payments.", "payments", "disabled", null],
  ["cards.wallet_provisioning", "In-app wallet provisioning", "Push-provision cards to mobile wallets.", "cards", "enabled", null],
];

export function seedFlags(db: DB, iso: (offsetMinutes: number) => string): void {
  const insert = db.prepare(`
    INSERT INTO feature_flags
      (id, flag_key, name, description, owner_team, environment, status,
       last_changed_by, last_changed_at, last_change_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  FLAGS.forEach(([key, name, description, team, status, reason], i) => {
    const id = `FF-${3001 + i}`;
    const createdAt = iso(-(40 - i) * 24 * 60);
    const changedAt = reason ? iso(-(12 - i) * 6 * 60) : null;
    insert.run(
      id, key, name, description, team, FLAG_ENVIRONMENT, status,
      reason ? "u_admin" : null, changedAt, reason, createdAt, changedAt ?? createdAt,
    );
    if (reason) {
      writeAuditEvent(db, {
        actorId: "u_admin",
        action: status === "enabled" ? FLAG_AUDIT_ACTIONS.enabled : FLAG_AUDIT_ACTIONS.disabled,
        entityType: FLAG_ENTITY,
        entityId: id,
        metadata: {
          previousStatus: status === "enabled" ? "disabled" : "enabled", newStatus: status,
          reason, flagKey: key, environment: FLAG_ENVIRONMENT, seeded: true,
        },
      }, changedAt!);
    }
  });
}
