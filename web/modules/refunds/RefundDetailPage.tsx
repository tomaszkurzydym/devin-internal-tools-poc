import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/AppShell";
import { AuditEventsTable, type AuditEvent } from "../../components/AuditEventsTable";
import { Button, formatDateTime } from "../../components/Form";
import { ErrorState, Loading, Notice } from "../../components/States";
import { StatusBadge, humanize } from "../../components/StatusBadge";
import { api } from "../../core/api";
import { useSession } from "../../core/session";
import { useAction } from "../../core/useAction";
import { useApi } from "../../core/useApi";
import { formatAmount, type RefundDetail } from "./types";

export function RefundDetailPage() {
  const { id = "" } = useParams();
  const { can } = useSession();
  const detail = useApi<RefundDetail>(`/api/refunds/requests/${encodeURIComponent(id)}`);
  const audit = useApi<{ events: AuditEvent[] }>(
    `/api/audit-events?entityType=refund_request&entityId=${encodeURIComponent(id)}`,
  );
  const { busy, feedback, setFeedback, run } = useAction<RefundDetail>({
    onSuccess: (updated) => {
      detail.setData(updated);
      audit.reload();
    },
    onConflict: detail.reload,
  });

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading />;
  const { refund: r, availableActions } = detail.data;
  const canReview = can("refunds.review");

  return (
    <>
      <p className="breadcrumb">
        <Link to="/refunds">← Refunds</Link>
      </p>
      <PageHeader
        title={r.customerName}
        subtitle={
          <>
            <code>{r.id}</code> · <StatusBadge value={r.status} /> · {formatAmount(r)}
          </>
        }
      />
      {feedback && (
        <Notice kind={feedback.kind} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Notice>
      )}
      <section className="card">
        <h2>Request <span className="muted small">(synthetic)</span></h2>
        <dl className="kv">
          <dt>Request ID</dt><dd>{r.id}</dd>
          <dt>Customer</dt><dd>{r.customerName}</dd>
          <dt>Account</dt><dd>{r.accountRef}</dd>
          <dt>Amount</dt><dd>{formatAmount(r)}</dd>
          <dt>Reason</dt><dd>{humanize(r.reason)}</dd>
          <dt>Requested</dt><dd>{formatDateTime(r.requestedAt)}</dd>
          <dt>Status</dt><dd><StatusBadge value={r.status} /></dd>
          {r.reviewedAt && (<><dt>Reviewed</dt><dd>{formatDateTime(r.reviewedAt)} by {r.reviewedByName ?? r.reviewedBy}</dd></>)}
        </dl>
      </section>
      <section className="card">
        <h2>Actions</h2>
        {!canReview ? (
          <p className="muted" data-testid="read-only-notice">Read-only: your role cannot review refund requests.</p>
        ) : availableActions.includes("markReviewed") ? (
          <div className="actions">
            <Button
              busy={busy === "review"}
              onClick={() =>
                void run(
                  "review",
                  () => api.post<RefundDetail>(`/api/refunds/requests/${r.id}/mark-reviewed`, {}),
                  "Marked as reviewed.",
                )
              }
            >
              Mark reviewed
            </Button>
          </div>
        ) : (
          <p className="muted">This request has been reviewed. No further actions are available here.</p>
        )}
      </section>
      <section className="card">
        <h2>Audit events</h2>
        {audit.error ? <ErrorState error={audit.error} onRetry={audit.reload} /> : <AuditEventsTable events={audit.data?.events ?? []} />}
      </section>
    </>
  );
}
