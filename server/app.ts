import express from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./core/db.js";
import { auditRouter } from "./core/audit.js";
import { errorHandler, HttpError, requireJson } from "./core/http.js";
import { permissionMatrix, permissionsFor, ROLES } from "./core/permissions.js";
import {
  SESSION_COOKIE,
  actor,
  createSession,
  deleteSession,
  listUsers,
  loadSession,
  requireAuth,
  requirePermission,
} from "./core/session.js";
import { MODULES } from "./modules/index.js";

export interface AppOptions {
  staticDir?: string;
  secureCookies?: boolean;
}

export function createApp(db: DB, opts: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api", requireJson, loadSession(db));

  // --- Demo identity (SIMULATION ONLY: replace with real SSO before any deployment) ---
  app.get("/api/demo-users", (_req, res) => {
    res.json({ users: listUsers(db).map(({ id, name, role }) => ({ id, name, role })) });
  });

  app.post("/api/session", (req, res) => {
    const userId: unknown = req.body?.userId;
    if (typeof userId !== "string") throw new HttpError(400, "validation_error", "userId is required");
    const sid = createSession(db, userId); // throws for unknown users, leaving any current session intact
    if (req.sessionId) deleteSession(db, req.sessionId);
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "strict",
      secure: opts.secureCookies ?? false,
      path: "/",
    });
    res.status(201).json({ ok: true });
  });

  app.delete("/api/session", (req, res) => {
    if (req.sessionId) deleteSession(db, req.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/session", requireAuth, (req, res) => {
    const user = actor(req);
    res.json({ user, permissions: permissionsFor(user.role) });
  });

  // --- Shared platform endpoints ---
  app.use("/api/audit-events", auditRouter(db, MODULES.flatMap((m) => m.auditActions)));

  app.get("/api/admin/overview", requirePermission("admin.access"), (_req, res) => {
    res.json({ users: listUsers(db), roles: ROLES, matrix: permissionMatrix() });
  });

  // --- Domain modules ---
  for (const m of MODULES) app.use(m.apiPath, m.router(db));

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "not_found", "Unknown API route")));

  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    const dir = opts.staticDir;
    app.use(express.static(dir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
