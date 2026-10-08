import type { DB } from "../core/db.js";
import { writeAuditEvent } from "../core/audit.js";
import { KYC_AUDIT_ACTIONS, KYC_ENTITY, type KycStatus, type RiskLevel, type VerificationSummary } from "../modules/kyc/types.js";

/** Synthetic data only: every name, ID and check result below is fictional. */
export const DEMO_USERS = [
  { id: "u_viewer", name: "Vera Viewer", email: "vera.viewer@example.test", role: "viewer" },
  { id: "u_reviewer", name: "Riley Reviewer", email: "riley.reviewer@example.test", role: "reviewer" },
  { id: "u_admin", name: "Ada Admin", email: "ada.admin@example.test", role: "admin" },
] as const;

const NAMES = [
  "Aurelia Quinnfield", "Bastian Morrowe", "Calla Venkatesh", "Dorian Halvorsen", "Elio Marchetti",
  "Freya Lindqvist", "Gideon Okafor", "Hana Takemura", "Ivo Petrakis", "Juniper Ashdown",
  "Kai Rautenberg", "Lior Ben-Ami", "Mira Castellanos", "Nico Varga", "Orla Fennimore",
  "Pax Delacroix", "Quill Hargreave", "Rosalind Mbeki", "Soren Vale", "Talia Novak",
  "Umar Seddiqi", "Vesna Kralj", "Wren Abernathy", "Xavi Llorente", "Yara Solberg", "Zeno Pappas",
];
const COUNTRIES = ["GB", "DE", "PL", "FR", "ES", "NL", "IE", "SE", "PT", "IT", "US", "CA"];
const STATUSES: KycStatus[] = ["pending", "pending", "pending", "in_review", "in_review", "approved", "rejected"];
const RISKS: RiskLevel[] = ["low", "low", "medium", "medium", "high"];
const FLAGS_BY_RISK: Record<RiskLevel, string[][]> = {
  low: [[], [], ["address_recently_changed"]],
  medium: [["document_expiring_soon"], ["ip_country_mismatch"], ["address_recently_changed", "thin_credit_file"]],
  high: [["sanctions_potential_match"], ["pep_potential_match", "high_value_expected_activity"], ["document_tamper_suspected", "liveness_retry"]],
};
const DOC_TYPES = ["passport", "national_id", "driving_licence", "residence_permit"];

function summaryFor(risk: RiskLevel, flags: string[], i: number): VerificationSummary {
  return {
    documentType: DOC_TYPES[i % DOC_TYPES.length]!,
    documentCheck: flags.includes("document_tamper_suspected") ? "manual_review" : "pass",
    livenessCheck: flags.includes("liveness_retry") ? "manual_review" : "pass",
    addressCheck: flags.includes("address_recently_changed") ? "manual_review" : "pass",
    sanctionsScreening: flags.includes("sanctions_potential_match") ? "potential_match" : "clear",
    pepScreening: flags.includes("pep_potential_match") ? "potential_match" : risk === "high" && i % 2 ? "potential_match" : "clear",
  };
}

export function seed(db: DB, opts: { baseTime?: Date } = {}): void {
  const base = (opts.baseTime ?? new Date("2026-09-30T09:00:00Z")).getTime();
  const iso = (offsetMinutes: number) => new Date(base + offsetMinutes * 60_000).toISOString();

  db.transaction(() => {
    const insertUser = db.prepare("INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)");
    for (const u of DEMO_USERS) insertUser.run(u.id, u.name, u.email, u.role);

    const insertApp = db.prepare(`
      INSERT INTO kyc_applications
        (id, applicant_name, country, submitted_at, risk_level, status, verification_summary, risk_flags,
         rejection_reason, decided_by, decided_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertNote = db.prepare(
      "INSERT INTO kyc_notes (id, application_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    );

    NAMES.forEach((name, i) => {
      const id = `KYC-${1001 + i}`;
      const risk = RISKS[(i * 3) % RISKS.length]!;
      const status = STATUSES[i % STATUSES.length]!;
      const flags = FLAGS_BY_RISK[risk][i % 3]!;
      const submittedAt = iso(-i * 9 * 60 - 30);
      const startedAt = iso(-i * 9 * 60 + 60);
      const decidedAt = iso(-i * 9 * 60 + 180);
      const decided = status === "approved" || status === "rejected";
      const rejectionReason = status === "rejected" ? "Supporting document could not be verified (synthetic)." : null;
      insertApp.run(
        id, name, COUNTRIES[i % COUNTRIES.length]!, submittedAt, risk, status,
        JSON.stringify(summaryFor(risk, flags, i)), JSON.stringify(flags),
        rejectionReason, decided ? "u_reviewer" : null, decided ? decidedAt : null,
        decided ? decidedAt : status === "in_review" ? startedAt : submittedAt,
      );

      // Seeded history so the audit log and final states are consistent from the start.
      const seeded = { seeded: true };
      if (status !== "pending") {
        writeAuditEvent(db, {
          actorId: "u_reviewer", action: KYC_AUDIT_ACTIONS.reviewStarted, entityType: KYC_ENTITY, entityId: id,
          metadata: { previousStatus: "pending", newStatus: "in_review", ...seeded },
        }, startedAt);
        const noteId = `note_seed_${id}`;
        insertNote.run(noteId, id, "u_reviewer", "Initial document review completed (synthetic note).", iso(-i * 9 * 60 + 90));
        writeAuditEvent(db, {
          actorId: "u_reviewer", action: KYC_AUDIT_ACTIONS.noteAdded, entityType: KYC_ENTITY, entityId: id,
          metadata: { noteId, status: "in_review", ...seeded },
        }, iso(-i * 9 * 60 + 90));
      }
      if (decided) {
        writeAuditEvent(db, {
          actorId: "u_reviewer",
          action: status === "approved" ? KYC_AUDIT_ACTIONS.approved : KYC_AUDIT_ACTIONS.rejected,
          entityType: KYC_ENTITY, entityId: id,
          metadata: { previousStatus: "in_review", newStatus: status, ...(rejectionReason ? { reason: rejectionReason } : {}), ...seeded },
        }, decidedAt);
      }
    });
  })();
}

export function seedIfEmpty(db: DB): boolean {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return false;
  seed(db);
  return true;
}
