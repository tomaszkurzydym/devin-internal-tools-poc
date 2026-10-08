import request from "supertest";
import { describe, expect, it } from "vitest";
import { APPROVED, IN_REVIEW, PENDING, auditCount, loginAs, noteCount, setup, statusOf } from "./helpers";

const MUTATIONS: Array<[string, string, object]> = [
  ["start-review", PENDING, {}],
  ["notes", PENDING, { body: "viewer note" }],
  ["approve", IN_REVIEW, {}],
  ["reject", IN_REVIEW, { reason: "viewer reason" }],
];

describe("server-side permissions", () => {
  it("denies every viewer mutation with 403 and changes no data", async () => {
    const { db, app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const before = { p: statusOf(db, PENDING), r: statusOf(db, IN_REVIEW), notes: noteCount(db, PENDING) };
    const auditBefore = (db.prepare("SELECT COUNT(*) AS n FROM audit_events").get() as { n: number }).n;

    for (const [action, id, body] of MUTATIONS) {
      const res = await viewer.post(`/api/kyc/applications/${id}/${action}`).send(body);
      expect(res.status, action).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
    expect(statusOf(db, PENDING)).toBe(before.p);
    expect(statusOf(db, IN_REVIEW)).toBe(before.r);
    expect(noteCount(db, PENDING)).toBe(before.notes);
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit_events").get() as { n: number }).n).toBe(auditBefore);
  });

  it("allows viewer read access to applications, notes and audit events", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    await viewer.get("/api/kyc/applications").expect(200);
    const detail = await viewer.get(`/api/kyc/applications/${APPROVED}`).expect(200);
    expect(detail.body.notes.length).toBeGreaterThan(0);
    await viewer.get("/api/audit-events").expect(200);
  });

  it("denies protected endpoints without a session (401)", async () => {
    const { db, app } = setup();
    const anon = request(app);
    for (const path of ["/api/session", "/api/kyc/applications", `/api/kyc/applications/${PENDING}`, "/api/audit-events", "/api/admin/overview"]) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(401);
    }
    for (const [action, id, body] of MUTATIONS) {
      expect((await anon.post(`/api/kyc/applications/${id}/${action}`).send(body)).status, action).toBe(401);
    }
    expect(statusOf(db, PENDING)).toBe("pending");
  });

  it("rejects forged, expired or unknown session cookies", async () => {
    const { db, app } = setup();
    const res = await request(app).get("/api/kyc/applications").set("Cookie", "sid=not-a-real-session");
    expect(res.status).toBe(401);

    const agent = await loginAs(app, "u_reviewer");
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await agent.get("/api/kyc/applications")).status).toBe(401);
  });

  it("blocks reviewer from Admin and allows admin", async () => {
    const { app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const r = await reviewer.get("/api/admin/overview");
    expect(r.status).toBe(403);
    const viewer = await loginAs(app, "u_viewer");
    expect((await viewer.get("/api/admin/overview")).status).toBe(403);

    const admin = await loginAs(app, "u_admin");
    const a = await admin.get("/api/admin/overview").expect(200);
    expect(a.body.users).toHaveLength(3);
    const review = a.body.matrix.find((m: { permission: string }) => m.permission === "kyc:review");
    expect(review.roles).toEqual({ viewer: false, reviewer: true, admin: true });
  });

  it("ignores role/actor supplied in the request body; actor comes from the session", async () => {
    const { db, app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const res = await viewer
      .post(`/api/kyc/applications/${PENDING}/start-review`)
      .send({ role: "admin", actorId: "u_admin", userId: "u_admin" });
    expect(res.status).toBe(403);
    expect(statusOf(db, PENDING)).toBe("pending");

    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post(`/api/kyc/applications/${PENDING}/start-review`).send({ actorId: "u_admin" }).expect(200);
    const evt = db.prepare("SELECT actor_id FROM audit_events WHERE entity_id = ? ORDER BY rowid DESC LIMIT 1").get(PENDING) as { actor_id: string };
    expect(evt.actor_id).toBe("u_reviewer");
  });

  it("rejects non-JSON mutation requests (415)", async () => {
    const { db, app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const res = await reviewer.post(`/api/kyc/applications/${PENDING}/start-review`).type("form").send("x=1");
    expect(res.status).toBe(415);
    expect(statusOf(db, PENDING)).toBe("pending");
    expect(auditCount(db, PENDING)).toBe(0);
  });
});
