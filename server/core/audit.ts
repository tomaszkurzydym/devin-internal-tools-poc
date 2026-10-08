import crypto from "node:crypto";
import { Router } from "express";
import type { DB } from "./db.js";
import { nowUtc } from "./db.js";
import { requirePermission } from "./session.js";

export interface AuditEventInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Appends an audit event. Call it inside the same db.transaction() as the mutation it
 * records so both commit or roll back together. There is intentionally no update/delete API.
 */
export function writeAuditEvent(db: DB, input: AuditEventInput, occurredAt: string = nowUtc()): string {
  const id = `evt_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, occurred_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.actorId, input.action, input.entityType, input.entityId, occurredAt, JSON.stringify(input.metadata ?? {}));
  return id;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
}

export function listAuditEvents(db: DB, q: AuditQuery = {}): AuditEvent[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.entityType) {
    where.push("e.entity_type = ?");
    params.push(q.entityType);
  }
  if (q.entityId) {
    where.push("e.entity_id = ? COLLATE NOCASE");
    params.push(q.entityId);
  }
  if (q.action) {
    where.push("e.action = ?");
    params.push(q.action);
  }
  const limit = Math.min(Math.max(Math.trunc(q.limit ?? 200), 1), 500);
  const rows = db
    .prepare(
      `SELECT e.id, e.actor_id, u.name AS actor_name, e.action, e.entity_type, e.entity_id, e.occurred_at, e.metadata
       FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY e.occurred_at DESC, e.rowid DESC
       LIMIT ${limit}`,
    )
    .all(...params) as Array<Record<string, string>>;
  return rows.map((r) => ({
    id: r.id!,
    actorId: r.actor_id!,
    actorName: r.actor_name ?? null,
    action: r.action!,
    entityType: r.entity_type!,
    entityId: r.entity_id!,
    occurredAt: r.occurred_at!,
    metadata: JSON.parse(r.metadata ?? "{}") as Record<string, unknown>,
  }));
}

export function listAuditActions(db: DB): string[] {
  return (db.prepare("SELECT DISTINCT action FROM audit_events ORDER BY action").all() as { action: string }[]).map(
    (r) => r.action,
  );
}

function parseLimit(v: unknown): number | undefined {
  if (typeof v !== "string" || !/^\d{1,4}$/.test(v)) return undefined;
  return Number(v);
}

/** Read-only audit API. No write/edit/delete routes exist. */
export function auditRouter(db: DB, knownActions: readonly string[] = []): Router {
  const router = Router();
  router.get("/", requirePermission("audit.read"), (req, res) => {
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    res.json({
      events: listAuditEvents(db, {
        entityType: str(req.query.entityType),
        entityId: str(req.query.entityId),
        action: str(req.query.action),
        limit: parseLimit(req.query.limit),
      }),
      actions: Array.from(new Set([...knownActions, ...listAuditActions(db)])).sort(),
    });
  });
  return router;
}
