import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export const DEFAULT_DB_PATH = process.env.DB_PATH ?? path.resolve("data/app.db");

export function openDatabase(file: string = DEFAULT_DB_PATH): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Idempotent schema creation. Shared tables (users, sessions, audit) + module tables. */
export function migrate(db: DB): void {
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

    CREATE TABLE IF NOT EXISTS kyc_applications (
      id TEXT PRIMARY KEY,
      applicant_name TEXT NOT NULL,
      country TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'in_review', 'approved', 'rejected')),
      verification_summary TEXT NOT NULL,
      risk_flags TEXT NOT NULL DEFAULT '[]',
      rejection_reason TEXT,
      decided_by TEXT REFERENCES users(id),
      decided_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kyc_notes (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES kyc_applications(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kyc_notes_app ON kyc_notes(application_id);
  `);
}

/** Drops every table (used only by the local demo reset command and tests). */
export function dropAll(db: DB): void {
  db.exec(`
    DROP TABLE IF EXISTS kyc_notes;
    DROP TABLE IF EXISTS kyc_applications;
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}

export function nowUtc(): string {
  return new Date().toISOString();
}
