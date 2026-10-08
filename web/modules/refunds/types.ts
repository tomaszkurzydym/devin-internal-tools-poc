export const REFUND_STATUSES = ["pending", "reviewed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

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

export interface RefundDetail {
  refund: RefundRequest;
  availableActions: "markReviewed"[];
}

export const formatAmount = (r: Pick<RefundRequest, "amountMinor" | "currency">) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: r.currency }).format(r.amountMinor / 100);
