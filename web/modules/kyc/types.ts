export const KYC_STATUSES = ["pending", "in_review", "approved", "rejected"] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type WorkflowAction = "startReview" | "approve" | "reject" | "addNote";

export interface KycApplication {
  id: string;
  applicantName: string;
  country: string;
  submittedAt: string;
  riskLevel: RiskLevel;
  status: KycStatus;
  verificationSummary: Record<string, string>;
  riskFlags: string[];
  rejectionReason: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface KycNote {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface KycDetail {
  application: KycApplication;
  notes: KycNote[];
  availableActions: WorkflowAction[];
}
