export const FLAGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY,
    flag_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    owner_team TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment = 'production'),
    status TEXT NOT NULL CHECK (status IN ('enabled', 'disabled')),
    last_changed_by TEXT REFERENCES users(id),
    last_changed_at TEXT,
    last_change_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const FLAGS_TABLES = ["feature_flags"] as const;
