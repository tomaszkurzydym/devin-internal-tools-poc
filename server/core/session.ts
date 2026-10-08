import crypto from "node:crypto";
import type { RequestHandler } from "express";
import type { DB } from "./db.js";
import { nowUtc } from "./db.js";
import { HttpError } from "./http.js";
import { hasPermission, type Permission, type Role } from "./permissions.js";

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    currentUser?: CurrentUser;
    sessionId?: string;
  }
}

export function listUsers(db: DB): CurrentUser[] {
  return db.prepare("SELECT id, name, email, role FROM users ORDER BY role, name").all() as CurrentUser[];
}

export function createSession(db: DB, userId: string): string {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) throw new HttpError(400, "unknown_user", "Unknown demo user");
  const id = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    now.toISOString(),
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  );
  return id;
}

export function deleteSession(db: DB, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/**
 * Resolves the acting user from the session cookie and the server-owned users table.
 * Role/actor are never read from the request body, headers, or browser storage.
 */
export function loadSession(db: DB): RequestHandler {
  const lookup = db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `);
  return (req, _res, next) => {
    const sid: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof sid === "string" && sid.length > 0) {
      const user = lookup.get(sid, nowUtc()) as CurrentUser | undefined;
      if (user) {
        req.currentUser = user;
        req.sessionId = sid;
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.currentUser) return next(new HttpError(401, "unauthenticated", "Sign in required"));
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.currentUser) return next(new HttpError(401, "unauthenticated", "Sign in required"));
    if (!hasPermission(req.currentUser.role, permission)) {
      return next(new HttpError(403, "forbidden", `Missing permission: ${permission}`));
    }
    next();
  };
}

/** Use inside handlers after requireAuth/requirePermission. */
export function actor(req: { currentUser?: CurrentUser }): CurrentUser {
  if (!req.currentUser) throw new HttpError(401, "unauthenticated", "Sign in required");
  return req.currentUser;
}
