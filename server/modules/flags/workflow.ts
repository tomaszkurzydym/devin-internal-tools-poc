import type { DB } from "../../core/db.js";
import { notFound, requiredText, validationError } from "../../core/http.js";
import { guardedTransition } from "../../core/transition.js";
import { getFlag } from "./repository.js";
import { FLAG_AUDIT_ACTIONS, FLAG_ENTITY, type FeatureFlag, type FlagStatus } from "./types.js";

/** Production flag rules: enable/disable only, each with a reason. Neither state is final. */
export const TRANSITIONS = {
  enable: { from: "disabled", to: "enabled" },
  disable: { from: "enabled", to: "disabled" },
} as const satisfies Record<string, { from: FlagStatus; to: FlagStatus }>;

export type FlagAction = keyof typeof TRANSITIONS;

export const MAX_REASON_LENGTH = 500;

const AUDIT_ACTION: Record<FlagAction, string> = {
  enable: FLAG_AUDIT_ACTIONS.enabled,
  disable: FLAG_AUDIT_ACTIONS.disabled,
};

export function availableActions(status: FlagStatus): FlagAction[] {
  return (Object.keys(TRANSITIONS) as FlagAction[]).filter((a) => TRANSITIONS[a].from === status);
}

function loadOr404(db: DB, id: string): FeatureFlag {
  const f = getFlag(db, id);
  if (!f) throw notFound(`Feature flag ${id} not found`);
  return f;
}

/**
 * Both states are reversible, so a status guard alone would let a stale request through after
 * someone else toggles the flag away and back. The caller must also send the `updatedAt` it saw.
 */
export function changeFlag(
  db: DB,
  actorId: string,
  id: string,
  action: FlagAction,
  input: { reason: unknown; expectedUpdatedAt: unknown },
): FeatureFlag {
  const flag = loadOr404(db, id);
  const changeReason = requiredText("reason", input.reason, "Change reason", MAX_REASON_LENGTH);
  const expected = input.expectedUpdatedAt;
  if (typeof expected !== "string" || expected.length === 0) {
    throw validationError({ expectedUpdatedAt: "expectedUpdatedAt (the flag's updatedAt you loaded) is required" });
  }
  if (Number.isNaN(Date.parse(expected))) {
    throw validationError({ expectedUpdatedAt: "expectedUpdatedAt must be an ISO timestamp" });
  }
  const { from, to } = TRANSITIONS[action];
  return guardedTransition(db, {
    update: (now) => {
      // updated_at is the concurrency token: keep it strictly increasing even for two changes in one
      // millisecond. last_changed_at stays the real change time, matching the audit event.
      const version = now > expected ? now : new Date(Date.parse(expected) + 1).toISOString();
      return db
        .prepare(
          `UPDATE feature_flags
           SET status = ?, last_changed_by = ?, last_changed_at = ?, last_change_reason = ?, updated_at = ?
           WHERE id = ? AND status = ? AND updated_at = ?`,
        )
        .run(to, actorId, now, changeReason, version, id, from, expected);
    },
    conflictMessage: () => {
      const current = loadOr404(db, id);
      return current.status !== from
        ? `Cannot ${action} flag ${flag.key} with status "${current.status}" (requires "${from}")`
        : `Flag ${flag.key} was changed by someone else since you loaded it; review the latest state and try again`;
    },
    audit: {
      actorId,
      action: AUDIT_ACTION[action],
      entityType: FLAG_ENTITY,
      entityId: id,
      metadata: { previousStatus: from, newStatus: to, reason: changeReason, flagKey: flag.key, environment: flag.environment },
    },
    result: () => loadOr404(db, id),
  });
}
