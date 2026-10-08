import type { DB } from "../../core/db.js";
import { likeContains } from "../../core/sql.js";
import type { RefundRequest, RefundStatus } from "./types.js";

type Row = Record<string, string | number | null>;

function toRefund(r: Row): RefundRequest {
  return {
    id: r.id as string,
    customerName: r.customer_name as string,
    accountRef: r.account_ref as string,
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    reason: r.reason as string,
    requestedAt: r.requested_at as string,
    status: r.status as RefundStatus,
    reviewedBy: (r.reviewed_by as string | null) ?? null,
    reviewedByName: (r.reviewed_by_name as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

const SELECT = `
  SELECT r.*, u.name AS reviewed_by_name
  FROM refund_requests r LEFT JOIN users u ON u.id = r.reviewed_by
`;

export function listRefunds(db: DB, f: { q?: string; status?: RefundStatus } = {}): RefundRequest[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push("(r.customer_name LIKE ? ESCAPE '\\' OR r.id LIKE ? ESCAPE '\\')");
    params.push(likeContains(f.q), likeContains(f.q));
  }
  if (f.status) {
    where.push("r.status = ?");
    params.push(f.status);
  }
  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.requested_at DESC`;
  return (db.prepare(sql).all(...params) as Row[]).map(toRefund);
}

export function getRefund(db: DB, id: string): RefundRequest | undefined {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row ? toRefund(row) : undefined;
}
