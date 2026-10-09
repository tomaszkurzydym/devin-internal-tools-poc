import type { DB } from "../../core/db.js";
import { likeContains } from "../../core/sql.js";
import type { FeatureFlag, FlagStatus, OwnerTeam } from "./types.js";

type Row = Record<string, string | null>;

function toFlag(r: Row): FeatureFlag {
  return {
    id: r.id as string,
    key: r.flag_key as string,
    name: r.name as string,
    description: r.description as string,
    ownerTeam: r.owner_team as OwnerTeam,
    environment: "production",
    status: r.status as FlagStatus,
    lastChangedBy: r.last_changed_by ?? null,
    lastChangedByName: r.last_changed_by_name ?? null,
    lastChangedAt: r.last_changed_at ?? null,
    lastChangeReason: r.last_change_reason ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

const SELECT = `
  SELECT f.*, u.name AS last_changed_by_name
  FROM feature_flags f LEFT JOIN users u ON u.id = f.last_changed_by
`;

export function listFlags(db: DB, f: { q?: string; status?: FlagStatus; team?: OwnerTeam } = {}): FeatureFlag[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    where.push("(f.flag_key LIKE ? ESCAPE '\\' OR f.name LIKE ? ESCAPE '\\' OR f.id LIKE ? ESCAPE '\\')");
    params.push(likeContains(f.q), likeContains(f.q), likeContains(f.q));
  }
  if (f.status) {
    where.push("f.status = ?");
    params.push(f.status);
  }
  if (f.team) {
    where.push("f.owner_team = ?");
    params.push(f.team);
  }
  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.flag_key`;
  return (db.prepare(sql).all(...params) as Row[]).map(toFlag);
}

export function getFlag(db: DB, id: string): FeatureFlag | undefined {
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as Row | undefined;
  return row ? toFlag(row) : undefined;
}
