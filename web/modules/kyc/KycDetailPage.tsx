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
import type { KycDetail } from "./types";

export function KycDetailPage() {
  const { id = "" } = useParams();
  const { can } = useSession();
  const detail = useApi<KycDetail>(`/api/kyc/applications/${encodeURIComponent(id)}`);
  const audit = useApi<{ events: AuditEvent[] }>(`/api/audit-events?entityType=kyc_application&entityId=${encodeURIComponent(id)}`);
  const { busy, feedback, setFeedback, run } = useAction<KycDetail>({
    onSuccess: (updated) => {
      detail.setData(updated);
      audit.reload();
    },
    onConflict: detail.reload,
  });
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [showReject, setShowReject] = useState(false);

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading />;
  const { application: app, notes, availableActions } = detail.data;
  const canReview = can("kyc.review");
  const allowed = (a: string) => canReview && availableActions.includes(a as never);

  const post = (path: string, body?: unknown) => () => api.post<KycDetail>(`/api/kyc/applications/${app.id}/${path}`, body);

  return (
    <>
      <p className="breadcrumb">
        <Link to="/kyc">← KYC Reviews</Link>
      </p>
      <PageHeader
        title={`${app.applicantName}`}
        subtitle={
          <>
            <code>{app.id}</code> · <StatusBadge value={app.status} /> · Risk <StatusBadge value={app.riskLevel} />
          </>
        }
      />
      {feedback && (
        <Notice kind={feedback.kind} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Notice>
      )}

      <div className="grid">
        <section className="card">
          <h2>Applicant</h2>
          <dl className="kv">
            <dt>Application ID</dt><dd>{app.id}</dd>
            <dt>Name</dt><dd>{app.applicantName}</dd>
            <dt>Country</dt><dd>{app.country}</dd>
            <dt>Submitted</dt><dd>{formatDateTime(app.submittedAt)}</dd>
            <dt>Status</dt><dd><StatusBadge value={app.status} /></dd>
            <dt>Risk level</dt><dd><StatusBadge value={app.riskLevel} /></dd>
            {app.decidedAt && (<><dt>Decided</dt><dd>{formatDateTime(app.decidedAt)} by {app.decidedByName ?? app.decidedBy}</dd></>)}
            {app.rejectionReason && (<><dt>Rejection reason</dt><dd>{app.rejectionReason}</dd></>)}
          </dl>
        </section>
        <section className="card">
          <h2>Verification summary <span className="muted small">(synthetic)</span></h2>
          <dl className="kv">
            {Object.entries(app.verificationSummary).map(([k, v]) => (
              <div key={k} className="kv-row">
                <dt>{humanize(k.replace(/([A-Z])/g, " $1").toLowerCase())}</dt>
                <dd><StatusBadge value={v} tone={v === "pass" || v === "clear" ? "success" : v === "fail" ? "danger" : "warning"} /></dd>
              </div>
            ))}
          </dl>
          <h3>Risk flags</h3>
          {app.riskFlags.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul className="flags">{app.riskFlags.map((f) => <li key={f}><StatusBadge value={f} tone="warning" /></li>)}</ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Actions</h2>
        {!canReview ? (
          <p className="muted" data-testid="read-only-notice">Read-only: your role cannot perform review actions.</p>
        ) : availableActions.filter((a) => a !== "addNote").length === 0 ? (
          <p className="muted">This application is {humanize(app.status).toLowerCase()} — the decision is final.</p>
        ) : (
          <div className="actions">
            {allowed("startReview") && (
              <Button busy={busy === "start"} onClick={() => void run("start", post("start-review"), "Review started.")}>
                Start review
              </Button>
            )}
            {allowed("approve") && (
              <Button variant="success" busy={busy === "approve"} onClick={() => void run("approve", post("approve"), "Application approved.")}>
                Approve
              </Button>
            )}
            {allowed("reject") && !showReject && (
              <Button variant="danger" onClick={() => setShowReject(true)}>Reject…</Button>
            )}
          </div>
        )}
        {allowed("reject") && showReject && (
          <Form
            onSubmit={() => {
              if (!reason.trim()) return setReasonError("Rejection reason is required");
              setReasonError(undefined);
              void run("reject", post("reject", { reason }), "Application rejected.", setReasonError).then((ok) => ok && setReason(""));
            }}
          >
            <TextAreaField id="reject-reason" label="Rejection reason" required value={reason} onChange={setReason} error={reasonError} placeholder="Why is this application being rejected?" />
            <div className="actions">
              <Button variant="danger" type="submit" busy={busy === "reject"}>Confirm rejection</Button>
              <Button variant="secondary" type="button" onClick={() => { setShowReject(false); setReasonError(undefined); }}>Cancel</Button>
            </div>
          </Form>
        )}
      </section>

      <section className="card">
        <h2>Review notes</h2>
        {notes.length === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="note-meta"><strong>{n.authorName}</strong> · {formatDateTime(n.createdAt)}</div>
                <div className="note-body">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
        {allowed("addNote") && (
          <Form
            onSubmit={() => {
              if (!note.trim()) return setNoteError("Note cannot be empty");
              setNoteError(undefined);
              void run("note", post("notes", { body: note }), "Note added.", setNoteError).then((ok) => ok && setNote(""));
            }}
          >
            <TextAreaField id="note" label="Add a note" value={note} onChange={setNote} error={noteError} placeholder="Internal review note" />
            <Button type="submit" busy={busy === "note"}>Add note</Button>
          </Form>
        )}
      </section>

      <section className="card">
        <h2>Audit events for this application</h2>
        <p className="small"><Link to={`/audit?entityId=${app.id}`}>Open in Audit Log →</Link></p>
        {audit.error ? <ErrorState error={audit.error} /> : !audit.data ? <Loading /> : <AuditEventsTable events={audit.data.events} showEntity={false} />}
      </section>
    </>
  );
}
