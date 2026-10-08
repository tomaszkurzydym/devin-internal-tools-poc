import type { DB } from "../../core/db.js";
import { notFound } from "../../core/http.js";
import { guardedTransition } from "../../core/transition.js";
import { getRefund } from "./repository.js";
import { REFUND_AUDIT_ACTIONS, REFUND_ENTITY, type RefundRequest, type RefundStatus } from "./types.js";

/** Refunds rules: one internal review step. "reviewed" is final; no approval or payment here. */
export const TRANSITIONS = {
  markReviewed: { from: "pending", to: "reviewed" },
} as const satisfies Record<string, { from: RefundStatus; to: RefundStatus }>;

export type RefundAction = keyof typeof TRANSITIONS;

export function availableActions(status: RefundStatus): RefundAction[] {
  return (Object.keys(TRANSITIONS) as RefundAction[]).filter((a) => TRANSITIONS[a].from === status);
}

function loadOr404(db: DB, id: string): RefundRequest {
  const r = getRefund(db, id);
  if (!r) throw notFound(`Refund request ${id} not found`);
  return r;
}

export function markReviewed(db: DB, actorId: string, id: string): RefundRequest {
  const { from, to } = TRANSITIONS.markReviewed;
  loadOr404(db, id);
  return guardedTransition(db, {
    update: (now) =>
      db
        .prepare(
          `UPDATE refund_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(to, actorId, now, now, id, from),
    conflictMessage: () =>
      `Cannot mark refund request as reviewed with status "${loadOr404(db, id).status}" (requires "${from}")`,
    audit: {
      actorId,
      action: REFUND_AUDIT_ACTIONS.markedReviewed,
      entityType: REFUND_ENTITY,
      entityId: id,
      metadata: { previousStatus: from, newStatus: to },
    },
    result: () => loadOr404(db, id),
  });
}
