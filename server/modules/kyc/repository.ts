import type { DB } from "../../core/db.js";
import { likeContains } from "../../core/sql.js";
import type { KycApplication, KycNote, KycStatus, RiskLevel } from "./types.js";

type Row = Record<string, string | null>;

function toApplication(r: Row): KycApplication {
  return {
    id: r.id!,
    applicantName: r.applicant_name!,
    country: r.country!,
    submittedAt: r.submitted_at!,
    riskLevel: r.risk_level as RiskLevel,
    status: r.status as KycStatus,
    verificationSummary: JSON.parse(r.verification_summary!),
    riskFlags: JSON.parse(r.risk_flags ?? "[]"),
    rejectionReason: r.rejection_reason ?? null,
    decidedBy: r.decided_by ?? null,
    decidedByName: r.decided_by_name ?? null,
    decidedAt: r.decided_at ?? null,
    updatedAt: r.updated_at!,
  };
}

const SELECT_APP = `
  SELECT a.*, u.name AS decided_by_name
  FROM kyc_applications a LEFT JOIN users u ON u.id = a.decided_by
`;

export interface ApplicationFilters {
  q?: string;
  status?: KycStatus;
  risk?: RiskLevel;
}

export function listApplications(db: DB, f: ApplicationFilters = {}): KycApplication[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    const like = likeContains(f.q);
    where.push("(a.applicant_name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (f.status) {
    where.push("a.status = ?");
    params.push(f.status);
  }
  if (f.risk) {
    where.push("a.risk_level = ?");
    params.push(f.risk);
  }
  const sql = `${SELECT_APP} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.submitted_at DESC`;
  return (db.prepare(sql).all(...params) as Row[]).map(toApplication);
}

export function getApplication(db: DB, id: string): KycApplication | undefined {
  const row = db.prepare(`${SELECT_APP} WHERE a.id = ?`).get(id) as Row | undefined;
  return row ? toApplication(row) : undefined;
}

export function listNotes(db: DB, applicationId: string): KycNote[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.application_id, n.author_id, u.name AS author_name, n.body, n.created_at
       FROM kyc_notes n JOIN users u ON u.id = n.author_id
       WHERE n.application_id = ? ORDER BY n.created_at ASC, n.rowid ASC`,
    )
    .all(applicationId) as Row[];
  return rows.map((r) => ({
    id: r.id!,
    applicationId: r.application_id!,
    authorId: r.author_id!,
    authorName: r.author_name!,
    body: r.body!,
    createdAt: r.created_at!,
  }));
}
