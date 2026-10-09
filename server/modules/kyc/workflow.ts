import crypto from "node:crypto";
import type { DB } from "../../core/db.js";
import { nowUtc } from "../../core/db.js";
import { conflict, notFound, requiredText } from "../../core/http.js";
import { writeAuditEvent } from "../../core/audit.js";
import { guardedTransition } from "../../core/transition.js";
import { getApplication } from "./repository.js";
import { KYC_AUDIT_ACTIONS, KYC_ENTITY, type KycApplication, type KycStatus } from "./types.js";

/**
 * KYC business rules. Approved/rejected are final in this prototype:
 * no reopen, no decision edits, no admin override.
 */
export const TRANSITIONS = {
  startReview: { from: "pending", to: "in_review" },
  approve: { from: "in_review", to: "approved" },
  reject: { from: "in_review", to: "rejected" },
} as const satisfies Record<string, { from: KycStatus; to: KycStatus }>;

const TRANSITION_LABELS: Record<keyof typeof TRANSITIONS, string> = {
  startReview: "start review on",
  approve: "approve",
  reject: "reject",
};

export type WorkflowAction = keyof typeof TRANSITIONS | "addNote";

const NOTE_ALLOWED_STATUSES: readonly KycStatus[] = ["pending", "in_review"];
export const MAX_TEXT_LENGTH = 2000;

export function availableActions(status: KycStatus): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  for (const [name, t] of Object.entries(TRANSITIONS)) {
    if (t.from === status) actions.push(name as WorkflowAction);
  }
  if (NOTE_ALLOWED_STATUSES.includes(status)) actions.push("addNote");
  return actions;
}

export const validateText = (field: string, value: unknown, label: string): string =>
  requiredText(field, value, label, MAX_TEXT_LENGTH);

function loadOr404(db: DB, id: string): KycApplication {
  const app = getApplication(db, id);
  if (!app) throw notFound(`Application ${id} not found`);
  return app;
}

/**
 * Conditional status update via the shared guardedTransition: a stale or repeated request
 * changes 0 rows and is rejected (409) with no audit event, so it cannot overwrite a decision.
 */
function transition(
  db: DB,
  actorId: string,
  id: string,
  name: keyof typeof TRANSITIONS,
  auditAction: string,
  extra: { rejectionReason?: string } = {},
): KycApplication {
  const { from, to } = TRANSITIONS[name];
  const isDecision = to === "approved" || to === "rejected";
  loadOr404(db, id);
  return guardedTransition(db, {
    update: (now) =>
      db
        .prepare(
          `UPDATE kyc_applications
           SET status = ?, updated_at = ?,
               decided_by = CASE WHEN ? THEN ? ELSE decided_by END,
               decided_at = CASE WHEN ? THEN ? ELSE decided_at END,
               rejection_reason = COALESCE(?, rejection_reason)
           WHERE id = ? AND status = ?`,
        )
        .run(to, now, isDecision ? 1 : 0, actorId, isDecision ? 1 : 0, now, extra.rejectionReason ?? null, id, from),
    conflictMessage: () =>
      `Cannot ${TRANSITION_LABELS[name]} application with status "${loadOr404(db, id).status}" (requires "${from}")`,
    audit: {
      actorId,
      action: auditAction,
      entityType: KYC_ENTITY,
      entityId: id,
      metadata: {
        previousStatus: from,
        newStatus: to,
        ...(extra.rejectionReason ? { reason: extra.rejectionReason } : {}),
      },
    },
    result: () => loadOr404(db, id),
  });
}

export function startReview(db: DB, actorId: string, id: string): KycApplication {
  return transition(db, actorId, id, "startReview", KYC_AUDIT_ACTIONS.reviewStarted);
}

export function approve(db: DB, actorId: string, id: string): KycApplication {
  return transition(db, actorId, id, "approve", KYC_AUDIT_ACTIONS.approved);
}

export function reject(db: DB, actorId: string, id: string, reason: unknown): KycApplication {
  const rejectionReason = validateText("reason", reason, "Rejection reason");
  return transition(db, actorId, id, "reject", KYC_AUDIT_ACTIONS.rejected, { rejectionReason });
}

export function addNote(db: DB, actorId: string, id: string, body: unknown): { noteId: string } {
  const text = validateText("body", body, "Note");
  const run = db.transaction(() => {
    const app = loadOr404(db, id);
    if (!NOTE_ALLOWED_STATUSES.includes(app.status)) {
      throw conflict(`Notes can only be added while pending or in review (status is "${app.status}")`);
    }
    const noteId = `note_${crypto.randomUUID()}`;
    const now = nowUtc();
    // Conditional insert guards against a concurrent decision between the read and the write.
    const result = db
      .prepare(
        `INSERT INTO kyc_notes (id, application_id, author_id, body, created_at)
         SELECT ?, id, ?, ?, ? FROM kyc_applications WHERE id = ? AND status IN ('pending', 'in_review')`,
      )
      .run(noteId, actorId, text, now, id);
    if (result.changes !== 1) throw conflict("Application status changed; note not added");
    writeAuditEvent(
      db,
      {
        actorId,
        action: KYC_AUDIT_ACTIONS.noteAdded,
        entityType: KYC_ENTITY,
        entityId: id,
        metadata: { noteId, status: app.status },
      },
      now,
    );
    return { noteId };
  });
  return run.immediate();
}
