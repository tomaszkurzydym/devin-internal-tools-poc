import { describe, expect, it } from "vitest";
import { auditCount, loginAs, setup } from "./helpers";
import type { DB } from "../server/core/db";
import { seedIfEmpty } from "../server/scripts/seedData";

const PENDING = "RF-2001";
const SEEDED_REVIEWED = "RF-2003";
const ACTION = "refunds.marked_reviewed";
const refundStatus = (db: DB, id: string) =>
  (db.prepare("SELECT status FROM refund_requests WHERE id = ?").get(id) as { status: string }).status;

describe("refunds: permissions", () => {
  it("viewer can read but the server denies mark-reviewed with no state change or audit event", async () => {
    const { app, db } = setup();
    const viewer = await loginAs(app, "u_viewer");
    expect((await viewer.get("/api/refunds/requests").expect(200)).body.refunds.length).toBeGreaterThan(10);
    const detail = await viewer.get(`/api/refunds/requests/${PENDING}`).expect(200);
    expect(detail.body.availableActions).toEqual(["markReviewed"]);
    const res = await viewer.post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({}).expect(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(refundStatus(db, PENDING)).toBe("pending");
    expect(auditCount(db, PENDING)).toBe(0);
  });

  it("unauthenticated requests are rejected", async () => {
    const { app } = setup();
    const request = (await import("supertest")).default;
    await request(app).get("/api/refunds/requests").expect(401);
    await request(app).post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({}).expect(401);
  });

  it.each(["u_reviewer", "u_admin"])("%s can mark a pending request reviewed", async (userId) => {
    const { app, db } = setup();
    const agent = await loginAs(app, userId);
    const res = await agent.post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({}).expect(200);
    expect(res.body.refund).toMatchObject({ status: "reviewed", reviewedBy: userId });
    expect(res.body.availableActions).toEqual([]);
    expect(refundStatus(db, PENDING)).toBe("reviewed");
  });
});

describe("refunds: workflow and audit", () => {
  it("persists the change with exactly one audit event, visible in the shared audit API", async () => {
    const { app, db } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({ actorId: "u_admin", role: "admin" }).expect(200);
    const row = db.prepare("SELECT status, reviewed_by, reviewed_at FROM refund_requests WHERE id = ?").get(PENDING);
    expect(row).toMatchObject({ status: "reviewed", reviewed_by: "u_reviewer" });

    const viewer = await loginAs(app, "u_viewer");
    const audit = await viewer.get(`/api/audit-events?entityId=${PENDING}`).expect(200);
    expect(audit.body.events).toHaveLength(1);
    expect(audit.body.events[0]).toMatchObject({
      actorId: "u_reviewer",
      action: ACTION,
      entityType: "refund_request",
      entityId: PENDING,
      metadata: { previousStatus: "pending", newStatus: "reviewed" },
    });
    expect(audit.body.events[0].occurredAt).toBe((row as { reviewed_at: string }).reviewed_at);
    expect(audit.body.actions).toContain(ACTION);
  });

  it("rejects a repeated transition with 409 and no duplicate audit event", async () => {
    const { app, db } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({}).expect(200);
    const again = await reviewer.post(`/api/refunds/requests/${PENDING}/mark-reviewed`).send({}).expect(409);
    expect(again.body.error.message).toMatch(/requires "pending"/);
    expect(auditCount(db, PENDING, ACTION)).toBe(1);

    const before = auditCount(db, SEEDED_REVIEWED);
    await reviewer.post(`/api/refunds/requests/${SEEDED_REVIEWED}/mark-reviewed`).send({}).expect(409);
    expect(auditCount(db, SEEDED_REVIEWED)).toBe(before);
  });

  it("returns 404 for unknown requests and leaves the audit log untouched", async () => {
    const { app, db } = setup();
    const total = () => (db.prepare("SELECT COUNT(*) AS n FROM audit_events").get() as { n: number }).n;
    const n = total();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post("/api/refunds/requests/RF-9999/mark-reviewed").send({}).expect(404);
    expect(total()).toBe(n);
  });

  it("supports search (literal) and status filters", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const pending = (await viewer.get("/api/refunds/requests?status=pending").expect(200)).body.refunds;
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((r: { status: string }) => r.status === "pending")).toBe(true);
    const byId = (await viewer.get("/api/refunds/requests?q=RF-2005").expect(200)).body.refunds;
    expect(byId.map((r: { id: string }) => r.id)).toEqual(["RF-2005"]);
    expect((await viewer.get("/api/refunds/requests?q=%25").expect(200)).body.refunds).toEqual([]);
    expect((await viewer.get("/api/refunds/requests?status=bogus").expect(200)).body.refunds.length).toBe(18);
  });
});

describe("module seeding", () => {
  it("seedIfEmpty adds a missing module's data to an existing database without touching others", () => {
    const { db } = setup();
    db.exec("DELETE FROM refund_requests");
    const kycBefore = (db.prepare("SELECT COUNT(*) AS n FROM kyc_applications").get() as { n: number }).n;
    expect(seedIfEmpty(db)).toBe(true);
    expect((db.prepare("SELECT COUNT(*) AS n FROM refund_requests").get() as { n: number }).n).toBe(18);
    expect((db.prepare("SELECT COUNT(*) AS n FROM kyc_applications").get() as { n: number }).n).toBe(kycBefore);
    expect(seedIfEmpty(db)).toBe(false);
  });
});
