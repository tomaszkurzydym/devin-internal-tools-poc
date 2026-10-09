import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/AppShell";
import { AuditEventsTable, type AuditEvent } from "../../components/AuditEventsTable";
import { Button, Form, TextAreaField, formatDateTime } from "../../components/Form";
import { ErrorState, Loading, Notice } from "../../components/States";
import { StatusBadge, humanize } from "../../components/StatusBadge";
import { api } from "../../core/api";
import { useSession } from "../../core/session";
import { useAction } from "../../core/useAction";
import { useApi } from "../../core/useApi";
import { MAX_REASON_LENGTH, type FlagDetail } from "./types";

export function FeatureFlagDetailPage() {
  const { id = "" } = useParams();
  const { can } = useSession();
  const detail = useApi<FlagDetail>(`/api/feature-flags/flags/${encodeURIComponent(id)}`);
  const audit = useApi<{ events: AuditEvent[] }>(
    `/api/audit-events?entityType=feature_flag&entityId=${encodeURIComponent(id)}`,
  );
  const { busy, feedback, setFeedback, run } = useAction<FlagDetail>({
    onSuccess: (updated) => {
      detail.setData(updated);
      audit.reload();
    },
    onConflict: () => {
      detail.reload();
      audit.reload();
    },
  });
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading />;
  const { flag: f, availableActions } = detail.data;
  const action = availableActions[0];
  const enabling = action === "enable";

  return (
    <>
      <p className="breadcrumb">
        <Link to="/feature-flags">← Feature Flags</Link>
      </p>
      <PageHeader
        title={f.name}
        subtitle={
          <>
            <code>{f.key}</code> · {f.id} · Production <StatusBadge value={f.status} />
          </>
        }
      />
      {feedback && (
        <Notice kind={feedback.kind} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Notice>
      )}
      <section className="card">
        <h2>Flag <span className="muted small">(synthetic)</span></h2>
        <dl className="kv">
          <dt>Key</dt><dd><code>{f.key}</code></dd>
          <dt>Description</dt><dd>{f.description}</dd>
          <dt>Owner team</dt><dd>{humanize(f.ownerTeam)}</dd>
          <dt>Environment</dt><dd>{humanize(f.environment)}</dd>
          <dt>Status</dt><dd><StatusBadge value={f.status} /></dd>
          <dt>Last changed</dt>
          <dd>{f.lastChangedAt ? `${formatDateTime(f.lastChangedAt)} by ${f.lastChangedByName ?? f.lastChangedBy}` : "Never (initial state)"}</dd>
          {f.lastChangeReason && (<><dt>Last change reason</dt><dd>{f.lastChangeReason}</dd></>)}
        </dl>
      </section>
      <section className="card">
        <h2>Change production state</h2>
        {!can("flags.toggle") ? (
          <p className="muted" data-testid="read-only-notice">Read-only: only admins can change production flags.</p>
        ) : action ? (
          <Form
            onSubmit={() => {
              if (!reason.trim()) return setReasonError("Change reason is required");
              setReasonError(undefined);
              void run(
                action,
                () => api.post<FlagDetail>(`/api/feature-flags/flags/${f.id}/${action}`, { reason }),
                enabling ? "Flag enabled in production." : "Flag disabled in production.",
                setReasonError,
              ).then((ok) => ok && setReason(""));
            }}
          >
            <TextAreaField
              id="change-reason"
              label="Change reason"
              required
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={setReason}
              error={reasonError}
              placeholder={enabling ? "Why is this flag being enabled in production?" : "Why is this flag being disabled in production?"}
            />
            <Button type="submit" variant={enabling ? "success" : "danger"} busy={busy === action}>
              {enabling ? "Enable in production" : "Disable in production"}
            </Button>
          </Form>
        ) : (
          <p className="muted">No changes are available for this flag.</p>
        )}
      </section>
      <section className="card">
        <h2>Audit events for this flag</h2>
        <p className="small"><Link to={`/audit?entityId=${f.id}`}>Open in Audit Log →</Link></p>
        {audit.error ? <ErrorState error={audit.error} onRetry={audit.reload} /> : <AuditEventsTable events={audit.data?.events ?? []} showEntity={false} />}
      </section>
    </>
  );
}
