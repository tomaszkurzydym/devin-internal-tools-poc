import { describe, expect, it } from "vitest";
import { loginAs, setup } from "./helpers";

describe("session switching", () => {
  it("an invalid user selection keeps the current session", async () => {
    const { app } = setup();
    const agent = await loginAs(app, "u_reviewer");
    expect((await agent.post("/api/session").send({ userId: "u_nobody" })).status).toBeGreaterThanOrEqual(400);
    const me = await agent.get("/api/session").expect(200);
    expect(me.body.user.id).toBe("u_reviewer");
  });
});

describe("queue search", () => {
  it.each(["%", "_", "\\"])("treats %s literally, not as a LIKE wildcard", async (q) => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const res = await viewer.get(`/api/kyc/applications?q=${encodeURIComponent(q)}`).expect(200);
    expect(res.body.applications).toEqual([]);
  });
});

describe("audit limit", () => {
  it.each(["abc", "1.5", "-3", "1e400", "99999"])("ignores invalid limit %s", async (limit) => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const res = await viewer.get(`/api/audit-events?limit=${encodeURIComponent(limit)}`).expect(200);
    expect(res.body.events.length).toBeGreaterThan(1);
  });

  it("honours a valid limit", async () => {
    const { app } = setup();
    const viewer = await loginAs(app, "u_viewer");
    const res = await viewer.get("/api/audit-events?limit=2").expect(200);
    expect(res.body.events).toHaveLength(2);
  });
});
