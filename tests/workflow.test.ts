import { describe, expect, it } from "vitest";
import { approve, reject, startReview } from "../server/modules/kyc/workflow";
import { HttpError } from "../server/core/http";
import {
  APPROVED, IN_REVIEW, PENDING, PENDING_2, REJECTED, auditCount, loginAs, noteCount, setup, statusOf,
} from "./helpers";

describe("KYC workflow transitions", () => {
  it("opening a detail page does not change status or write audit events", async () => {
    const { db, app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const res = await reviewer.get(`/api/kyc/applications/${PENDING}`).expect(200);
    expect(res.body.application.status).toBe("pending");
    expect(res.body.availableActions).toEqual(["startReview", "addNote"]);
    expect(statusOf(db, PENDING)).toBe("pending");
    expect(auditCount(db, PENDING)).toBe(0);
  });

  it("supports pending → in_review → approved, with expected audit events", async () => {
    const { app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const started = await reviewer.post(`/api/kyc/applications/${PENDING}/start-review`).send({}).expect(200);
    expect(started.body.application.status).toBe("in_review");

    const noted = await reviewer.post(`/api/kyc/applications/${PENDING}/notes`).send({ body: "  Docs look fine  " }).expect(201);
    expect(noted.body.notes.at(-1)).toMatchObject({ body: "Docs look fine", authorId: "u_reviewer", authorName: "Riley Reviewer" });

    const approved = await reviewer.post(`/api/kyc/applications/${PENDING}/approve`).send({}).expect(200);
    expect(approved.body.application).toMatchObject({ status: "approved", decidedBy: "u_reviewer" });
    expect(approved.body.availableActions).toEqual([]);

    const events = (await reviewer.get(`/api/audit-events?entityId=${PENDING}`).expect(200)).body.events;
    expect(events.map((e: { action: string }) => e.action)).toEqual(["kyc.approved", "kyc.note_added", "kyc.review_started"]);
    for (const e of events) {
      expect(e).toMatchObject({ actorId: "u_reviewer", entityType: "kyc_application", entityId: PENDING });
      expect(e.id).toMatch(/^evt_/);
      expect(e.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(events[0].metadata).toEqual({ previousStatus: "in_review", newStatus: "approved" });
    expect(events[1].metadata).toEqual({ noteId: noted.body.noteId, status: "in_review" });
    expect(events[2].metadata).toEqual({ previousStatus: "pending", newStatus: "in_review" });
  });

  it("rejects in_review with a reason and records it", async () => {
    const { db, app } = setup();
    const admin = await loginAs(app, "u_admin");
    const res = await admin.post(`/api/kyc/applications/${IN_REVIEW}/reject`).send({ reason: "Document mismatch" }).expect(200);
    expect(res.body.application).toMatchObject({ status: "rejected", rejectionReason: "Document mismatch", decidedBy: "u_admin" });
    const evt = db.prepare("SELECT actor_id, metadata FROM audit_events WHERE entity_id = ? AND action = 'kyc.rejected'").get(IN_REVIEW) as { actor_id: string; metadata: string };
    expect(evt.actor_id).toBe("u_admin");
    expect(JSON.parse(evt.metadata)).toEqual({ previousStatus: "in_review", newStatus: "rejected", reason: "Document mismatch" });
  });

  it.each([
    ["approve", PENDING, {}, "pending"],
    ["reject", PENDING, { reason: "x" }, "pending"],
    ["start-review", IN_REVIEW, {}, "in_review"],
    ["start-review", APPROVED, {}, "approved"],
    ["approve", APPROVED, {}, "approved"],
    ["reject", APPROVED, { reason: "x" }, "approved"],
    ["approve", REJECTED, {}, "rejected"],
    ["notes", APPROVED, { body: "late note" }, "approved"],
    ["notes", REJECTED, { body: "late note" }, "rejected"],
  ])("blocks invalid %s on %s (409) without side effects", async (action, id, body, status) => {
    const { db, app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const audits = auditCount(db, id);
    const notes = noteCount(db, id);
    const res = await reviewer.post(`/api/kyc/applications/${id}/${action}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
    expect(statusOf(db, id)).toBe(status);
    expect(auditCount(db, id)).toBe(audits);
    expect(noteCount(db, id)).toBe(notes);
  });

  it("returns 404 for unknown applications", async () => {
    const { app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.get("/api/kyc/applications/KYC-0000").expect(404);
    await reviewer.post("/api/kyc/applications/KYC-0000/start-review").send({}).expect(404);
  });
});

describe("input validation", () => {
  it.each([[{}], [{ body: "" }], [{ body: "   " }], [{ body: 42 }], [{ body: "x".repeat(2001) }]])(
    "rejects invalid note %j with 400 and no data change",
    async (payload) => {
      const { db, app } = setup();
      const reviewer = await loginAs(app, "u_reviewer");
      const res = await reviewer.post(`/api/kyc/applications/${PENDING}/notes`).send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.details.body).toBeTruthy();
      expect(noteCount(db, PENDING)).toBe(0);
      expect(auditCount(db, PENDING)).toBe(0);
    },
  );

  it("allows notes while pending", async () => {
    const { db, app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post(`/api/kyc/applications/${PENDING_2}/notes`).send({ body: "pre-review note" }).expect(201);
    expect(statusOf(db, PENDING_2)).toBe("pending");
    expect(auditCount(db, PENDING_2, "kyc.note_added")).toBe(1);
  });

  it.each([[{}], [{ reason: "" }], [{ reason: "  \n " }], [{ reason: null }]])(
    "requires a rejection reason %j (400, status unchanged)",
    async (payload) => {
      const { db, app } = setup();
      const reviewer = await loginAs(app, "u_reviewer");
      const res = await reviewer.post(`/api/kyc/applications/${IN_REVIEW}/reject`).send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.details.reason).toMatch(/required/);
      expect(statusOf(db, IN_REVIEW)).toBe("in_review");
      expect(auditCount(db, IN_REVIEW, "kyc.rejected")).toBe(0);
    },
  );

  it("rejects malformed JSON with 400", async () => {
    const { app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    const res = await reviewer.post(`/api/kyc/applications/${PENDING}/notes`).set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });
});

describe("repeated / stale decisions", () => {
  it("a repeated approve does not create a second decision event", async () => {
    const { db, app } = setup();
    const reviewer = await loginAs(app, "u_reviewer");
    await reviewer.post(`/api/kyc/applications/${IN_REVIEW}/approve`).send({}).expect(200);
    const decidedAt = (db.prepare("SELECT decided_at FROM kyc_applications WHERE id = ?").get(IN_REVIEW) as { decided_at: string }).decided_at;
    await reviewer.post(`/api/kyc/applications/${IN_REVIEW}/approve`).send({}).expect(409);
    expect(statusOf(db, IN_REVIEW)).toBe("approved");
    expect(auditCount(db, IN_REVIEW, "kyc.approved")).toBe(1);
    expect((db.prepare("SELECT decided_at FROM kyc_applications WHERE id = ?").get(IN_REVIEW) as { decided_at: string }).decided_at).toBe(decidedAt);
  });

  it("a stale reject after approval cannot overwrite the decision", async () => {
    const { db, app } = setup();
    const a = await loginAs(app, "u_reviewer");
    const b = await loginAs(app, "u_admin");
    await a.post(`/api/kyc/applications/${IN_REVIEW}/approve`).send({}).expect(200);
    const res = await b.post(`/api/kyc/applications/${IN_REVIEW}/reject`).send({ reason: "stale tab" });
    expect(res.status).toBe(409);
    const row = db.prepare("SELECT status, rejection_reason, decided_by FROM kyc_applications WHERE id = ?").get(IN_REVIEW);
    expect(row).toEqual({ status: "approved", rejection_reason: null, decided_by: "u_reviewer" });
    expect(auditCount(db, IN_REVIEW, "kyc.approved")).toBe(1);
    expect(auditCount(db, IN_REVIEW, "kyc.rejected")).toBe(0);
  });

  it("concurrent decisions: exactly one wins", async () => {
    const { db, app } = setup();
    const a = await loginAs(app, "u_reviewer");
    const b = await loginAs(app, "u_admin");
    const results = await Promise.all([
      a.post(`/api/kyc/applications/${IN_REVIEW}/approve`).send({}),
      b.post(`/api/kyc/applications/${IN_REVIEW}/reject`).send({ reason: "race" }),
      a.post(`/api/kyc/applications/${IN_REVIEW}/approve`).send({}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const decisions =
      auditCount(db, IN_REVIEW, "kyc.approved") + auditCount(db, IN_REVIEW, "kyc.rejected");
    expect(decisions).toBe(1);
  });

  it("rolls back the mutation if the audit write fails (same transaction)", () => {
    const { db } = setup();
    // Simulate an audit failure: unknown actor violates the audit_events FK.
    expect(() => startReview(db, "u_does_not_exist", PENDING)).toThrow();
    expect(statusOf(db, PENDING)).toBe("pending");
    expect(auditCount(db, PENDING)).toBe(0);
  });

  it("service layer enforces transitions directly (not only via HTTP)", () => {
    const { db } = setup();
    expect(() => approve(db, "u_reviewer", PENDING)).toThrow(HttpError);
    expect(() => reject(db, "u_reviewer", IN_REVIEW, "")).toThrow(HttpError);
    expect(statusOf(db, IN_REVIEW)).toBe("in_review");
  });
});

describe("audit log", () => {
  it("is append-only at the database level and has no write endpoints", async () => {
    const { db, app } = setup();
    expect(() => db.prepare("DELETE FROM audit_events").run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE audit_events SET action = 'x'").run()).toThrow(/append-only/);
    const admin = await loginAs(app, "u_admin");
    for (const m of ["post", "put", "patch", "delete"] as const) {
      expect((await admin[m]("/api/audit-events").send({})).status, m).toBe(404);
    }
  });

  it("lists newest first and filters by application ID and action", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const all = (await viewer.get("/api/audit-events").expect(200)).body.events as { occurredAt: string }[];
    const times = all.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    const byAction = (await viewer.get("/api/audit-events?action=kyc.rejected").expect(200)).body.events;
    expect(byAction.length).toBeGreaterThan(0);
    expect(byAction.every((e: { action: string }) => e.action === "kyc.rejected")).toBe(true);
    const byId = (await viewer.get(`/api/audit-events?entityId=${APPROVED}`).expect(200)).body.events;
    expect(byId.every((e: { entityId: string }) => e.entityId === APPROVED)).toBe(true);
    expect(byId.length).toBe(3);
  });
});

describe("queue filters", () => {
  it("search, status and risk filters combine", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const all = (await viewer.get("/api/kyc/applications").expect(200)).body.applications;
    expect(all.length).toBeGreaterThanOrEqual(20);
    const combo = (await viewer.get("/api/kyc/applications?status=pending&risk=high").expect(200)).body.applications;
    expect(combo.every((a: { status: string; riskLevel: string }) => a.status === "pending" && a.riskLevel === "high")).toBe(true);
    const byName = (await viewer.get("/api/kyc/applications?q=quinn").expect(200)).body.applications;
    expect(byName.map((a: { id: string }) => a.id)).toEqual([PENDING]);
    const byId = (await viewer.get(`/api/kyc/applications?q=${APPROVED}`).expect(200)).body.applications;
    expect(byId.map((a: { id: string }) => a.id)).toEqual([APPROVED]);
  });
});
