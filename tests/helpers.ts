import request from "supertest";
import { createApp } from "../server/app";
import { openDatabase, type DB } from "../server/core/db";
import { seed } from "../server/scripts/seedData";

export function setup() {
  const db = openDatabase(":memory:");
  seed(db);
  const app = createApp(db);
  return { db, app };
}

export async function loginAs(app: ReturnType<typeof createApp>, userId: string) {
  const agent = request.agent(app);
  await agent.post("/api/session").send({ userId }).expect(201);
  return agent;
}

export const statusOf = (db: DB, id: string) =>
  (db.prepare("SELECT status FROM kyc_applications WHERE id = ?").get(id) as { status: string }).status;

export const auditCount = (db: DB, id: string, action?: string) =>
  (
    db
      .prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE entity_id = ? ${action ? "AND action = ?" : ""}`)
      .get(...(action ? [id, action] : [id])) as { n: number }
  ).n;

export const noteCount = (db: DB, id: string) =>
  (db.prepare("SELECT COUNT(*) AS n FROM kyc_notes WHERE application_id = ?").get(id) as { n: number }).n;

/** Seed layout: index % 7 -> pending, pending, pending, in_review, in_review, approved, rejected. */
export const PENDING = "KYC-1001";
export const PENDING_2 = "KYC-1002";
export const IN_REVIEW = "KYC-1004";
export const APPROVED = "KYC-1006";
export const REJECTED = "KYC-1007";
