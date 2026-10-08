export const KYC_SCHEMA = `
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
`;

export const KYC_TABLES = ["kyc_notes", "kyc_applications"] as const;
