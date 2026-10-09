import { describe, expect, it } from "vitest";
import { auditCount, loginAs, setup } from "./helpers";
import type { DB } from "../server/core/db";
import { seedIfEmpty } from "../server/scripts/seedData";

const DISABLED = "FF-3001"; // payments.instant_payouts, never changed
const ENABLED_WITH_HISTORY = "FF-3002"; // payments.fx_quotes_v2, one seeded flags.enabled event
const BASE = "/api/feature-flags/flags";
const version = (db: DB, id: string) =>
  (db.prepare("SELECT updated_at FROM feature_flags WHERE id = ?").get(id) as { updated_at: string }).updated_at;
const flagRow = (db: DB, id: string) =>
  db.prepare("SELECT status, last_changed_by, last_change_reason, last_changed_at FROM feature_flags WHERE id = ?").get(id) as {
    status: string; last_changed_by: string | null; last_change_reason: string | null; last_changed_at: string | null;
  };

describe("feature flags: permissions", () => {
  it.each(["u_viewer", "u_reviewer"])("%s can read but the server denies toggling (403, no change, no audit)", async (userId) => {
    const { app, db } = setup();
    const agent = await loginAs(app, userId);
    expect((await agent.get(BASE).expect(200)).body.flags).toHaveLength(12);
    expect((await agent.get(`${BASE}/${DISABLED}`).expect(200)).body.availableActions).toEqual(["enable"]);
    const res = await agent.post(`${BASE}/${DISABLED}/enable`).send({ reason: "try" }).expect(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(flagRow(db, DISABLED).status).toBe("disabled");
    expect(auditCount(db, DISABLED)).toBe(0);
  });

  it("unauthenticated requests are rejected", async () => {
    const { app } = setup();
    const request = (await import("supertest")).default;
    await request(app).get(BASE).expect(401);
    await request(app).post(`${BASE}/${DISABLED}/enable`).send({ reason: "x" }).expect(401);
  });

  it("flags.toggle is admin-only in the permission matrix", async () => {
    const { app } = setup();
    const admin = await loginAs(app, "u_admin");
    const matrix = (await admin.get("/api/admin/overview").expect(200)).body.matrix;
    expect(matrix.find((m: { permission: string }) => m.permission === "flags.toggle").roles).toEqual({
      viewer: false, reviewer: false, admin: true,
    });
  });
});

describe("feature flags: workflow and audit", () => {
  it("admin enables a flag: persisted with exactly one audit event visible in the shared audit API", async () => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const res = await admin
      .post(`${BASE}/${DISABLED}/enable`)
      .send({ reason: "  Launch approved in release review  ", expectedUpdatedAt: version(db, DISABLED), actorId: "u_viewer", role: "viewer" })
      .expect(200);
    expect(res.body.flag).toMatchObject({ status: "enabled", lastChangedBy: "u_admin", lastChangeReason: "Launch approved in release review" });
    expect(res.body.availableActions).toEqual(["disable"]);
    const row = flagRow(db, DISABLED);
    expect(row).toMatchObject({ status: "enabled", last_changed_by: "u_admin" });

    const viewer = await loginAs(app, "u_viewer");
    const audit = await viewer.get(`/api/audit-events?entityId=${DISABLED}`).expect(200);
    expect(audit.body.events).toHaveLength(1);
    expect(audit.body.events[0]).toMatchObject({
      actorId: "u_admin",
      action: "flags.enabled",
      entityType: "feature_flag",
      entityId: DISABLED,
      metadata: {
        previousStatus: "disabled", newStatus: "enabled", reason: "Launch approved in release review",
        flagKey: "payments.instant_payouts", environment: "production",
      },
    });
    expect(audit.body.events[0].occurredAt).toBe(row.last_changed_at);
    expect(audit.body.actions).toEqual(expect.arrayContaining(["flags.enabled", "flags.disabled"]));
  });

  it("rejects a repeated or stale change with 409 and no duplicate audit event", async () => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const loaded = version(db, DISABLED);
    await admin.post(`${BASE}/${DISABLED}/enable`).send({ reason: "go", expectedUpdatedAt: loaded }).expect(200);
    const again = await admin.post(`${BASE}/${DISABLED}/enable`).send({ reason: "go again", expectedUpdatedAt: loaded }).expect(409);
    expect(again.body.error.message).toMatch(/requires "disabled"/);
    expect(auditCount(db, DISABLED)).toBe(1);
    expect(flagRow(db, DISABLED).last_change_reason).toBe("go");
  });

  it("disable and re-enable are both allowed (neither state is final), one event each", async () => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const before = auditCount(db, ENABLED_WITH_HISTORY);
    await admin.post(`${BASE}/${ENABLED_WITH_HISTORY}/disable`).send({ reason: "Incident INC-1 mitigation", expectedUpdatedAt: version(db, ENABLED_WITH_HISTORY) }).expect(200);
    await admin
      .post(`${BASE}/${ENABLED_WITH_HISTORY}/enable`)
      .send({ reason: "Incident resolved", expectedUpdatedAt: version(db, ENABLED_WITH_HISTORY) })
      .expect(200);
    expect(auditCount(db, ENABLED_WITH_HISTORY, "flags.disabled")).toBe(1);
    expect(auditCount(db, ENABLED_WITH_HISTORY)).toBe(before + 2);
    expect(flagRow(db, ENABLED_WITH_HISTORY).status).toBe("enabled");
  });

  it("rejects a stale change after someone else toggled the flag away and back (409, no event)", async () => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const staleTab = version(db, DISABLED);
    await admin.post(`${BASE}/${DISABLED}/enable`).send({ reason: "on", expectedUpdatedAt: staleTab }).expect(200);
    await admin.post(`${BASE}/${DISABLED}/disable`).send({ reason: "off", expectedUpdatedAt: version(db, DISABLED) }).expect(200);
    expect(flagRow(db, DISABLED).status).toBe("disabled");
    const res = await admin.post(`${BASE}/${DISABLED}/enable`).send({ reason: "stale", expectedUpdatedAt: staleTab }).expect(409);
    expect(res.body.error.message).toMatch(/changed by someone else/);
    expect(flagRow(db, DISABLED)).toMatchObject({ status: "disabled", last_change_reason: "off" });
    expect(auditCount(db, DISABLED)).toBe(2);
  });

  it("requires expectedUpdatedAt (400, no change)", async () => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const res = await admin.post(`${BASE}/${DISABLED}/enable`).send({ reason: "ok" }).expect(400);
    expect(res.body.error.details.expectedUpdatedAt).toMatch(/required/);
    expect(flagRow(db, DISABLED).status).toBe("disabled");
    expect(auditCount(db, DISABLED)).toBe(0);
  });

  it.each([
    [{}, /required/],
    [{ reason: "   " }, /required/],
    [{ reason: "x".repeat(501) }, /at most 500/],
  ])("rejects an invalid reason %# with 400 and no change", async (body, msg) => {
    const { app, db } = setup();
    const admin = await loginAs(app, "u_admin");
    const res = await admin.post(`${BASE}/${DISABLED}/enable`).send(body).expect(400);
    expect(res.body.error.details.reason).toMatch(msg);
    expect(flagRow(db, DISABLED).status).toBe("disabled");
    expect(auditCount(db, DISABLED)).toBe(0);
  });

  it("returns 404 for unknown flags and writes nothing", async () => {
    const { app, db } = setup();
    const total = () => (db.prepare("SELECT COUNT(*) AS n FROM audit_events").get() as { n: number }).n;
    const n = total();
    const admin = await loginAs(app, "u_admin");
    await admin.get(`${BASE}/FF-9999`).expect(404);
    await admin.post(`${BASE}/FF-9999/enable`).send({ reason: "x" }).expect(404);
    expect(total()).toBe(n);
  });

  it("supports literal search plus status and team filters", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const get = async (q: string) => (await viewer.get(`${BASE}?${q}`).expect(200)).body.flags as { id: string; status: string; ownerTeam: string }[];
    expect((await get("q=instant")).map((f) => f.id).sort()).toEqual(["FF-3001", "FF-3011"]);
    expect((await get("q=fx_quotes")).map((f) => f.id)).toEqual(["FF-3002"]);
    expect(await get("q=%25")).toEqual([]);
    const enabled = await get("status=enabled");
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every((f) => f.status === "enabled")).toBe(true);
    const cards = await get("team=cards&status=enabled");
    expect(cards.map((f) => f.id).sort()).toEqual(["FF-3005", "FF-3012"]);
    expect(await get("team=bogus&status=bogus")).toHaveLength(12);
  });
});

describe("feature flags: seeding", () => {
  it("seedIfEmpty adds flags to an existing database without touching other modules", () => {
    const { db } = setup();
    db.exec("DELETE FROM feature_flags");
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const kyc = count("kyc_applications");
    const refunds = count("refund_requests");
    expect(seedIfEmpty(db)).toBe(true);
    expect(count("feature_flags")).toBe(12);
    expect(count("kyc_applications")).toBe(kyc);
    expect(count("refund_requests")).toBe(refunds);
    expect(seedIfEmpty(db)).toBe(false);
  });
});
