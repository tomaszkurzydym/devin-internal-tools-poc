export const KYC_STATUSES = ["pending", "in_review", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const KYC_ENTITY = "kyc_application";

export const KYC_AUDIT_ACTIONS = {
  reviewStarted: "kyc.review_started",
  noteAdded: "kyc.note_added",
  approved: "kyc.approved",
  rejected: "kyc.rejected",
} as const;

export interface VerificationSummary {
  documentType: string;
  documentCheck: "pass" | "fail" | "manual_review";
  livenessCheck: "pass" | "fail" | "manual_review";
  addressCheck: "pass" | "fail" | "manual_review";
  sanctionsScreening: "clear" | "potential_match";
  pepScreening: "clear" | "potential_match";
}

export interface KycApplication {
  id: string;
  applicantName: string;
  country: string;
  submittedAt: string;
  riskLevel: RiskLevel;
  status: KycStatus;
  verificationSummary: VerificationSummary;
  riskFlags: string[];
  rejectionReason: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface KycNote {
  id: string;
  applicationId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}
