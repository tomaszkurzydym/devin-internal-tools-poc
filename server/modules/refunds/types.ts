export const REFUND_STATUSES = ["pending", "reviewed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_ENTITY = "refund_request";

export const REFUND_AUDIT_ACTIONS = {
  markedReviewed: "refunds.marked_reviewed",
} as const;

/** Internal review record only: no payment execution or provider data. */
export interface RefundRequest {
  id: string;
  customerName: string;
  accountRef: string;
  amountMinor: number;
  currency: string;
  reason: string;
  requestedAt: string;
  status: RefundStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}
