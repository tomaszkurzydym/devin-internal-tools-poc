import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export const DEFAULT_DB_PATH = process.env.DB_PATH ?? path.resolve("data/app.db");

/** Per-module persistence: DDL (idempotent) and its tables in drop order. */
export interface ModuleSchema {
  schema: string;
  tables: readonly string[];
}

export function openDatabase(file: string = DEFAULT_DB_PATH, modules: readonly ModuleSchema[] = []): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db, modules);
  return db;
}

/** Idempotent schema creation: shared tables (users, sessions, audit), then each module's tables. */
export function migrate(db: DB, modules: readonly ModuleSchema[] = []): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'reviewer', 'admin'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events(occurred_at);

    -- Append-only guard at the database level (defence in depth; not tamper-proof storage).
    CREATE TRIGGER IF NOT EXISTS audit_events_no_update
      BEFORE UPDATE ON audit_events
      BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
      BEFORE DELETE ON audit_events
      BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
  `);
  for (const m of modules) db.exec(m.schema);
}

/** Drops every table (used only by the local demo reset command and tests). */
export function dropAll(db: DB, modules: readonly ModuleSchema[] = []): void {
  for (const m of modules) for (const t of m.tables) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.exec(`
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}

export function nowUtc(): string {
  return new Date().toISOString();
}
