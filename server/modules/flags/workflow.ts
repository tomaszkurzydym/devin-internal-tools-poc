import type { DB } from "../../core/db.js";
import { notFound, requiredText } from "../../core/http.js";
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

export function changeFlag(db: DB, actorId: string, id: string, action: FlagAction, reason: unknown): FeatureFlag {
  const flag = loadOr404(db, id);
  const changeReason = requiredText("reason", reason, "Change reason", MAX_REASON_LENGTH);
  const { from, to } = TRANSITIONS[action];
  return guardedTransition(db, {
    update: (now) =>
      db
        .prepare(
          `UPDATE feature_flags
           SET status = ?, last_changed_by = ?, last_changed_at = ?, last_change_reason = ?, updated_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(to, actorId, now, changeReason, now, id, from),
    conflictMessage: () =>
      `Cannot ${action} flag ${flag.key} with status "${loadOr404(db, id).status}" (requires "${from}")`,
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
