export const REFUNDS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS refund_requests (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    account_ref TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL,
    reason TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed')),
    reviewed_by TEXT REFERENCES users(id),
    reviewed_at TEXT,
    updated_at TEXT NOT NULL
  );
`;

export const REFUNDS_TABLES = ["refund_requests"] as const;
