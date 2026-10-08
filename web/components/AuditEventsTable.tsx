import { DataTable } from "./DataTable";
import { StatusBadge } from "./StatusBadge";

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return <span className="muted">—</span>;
  return (
    <dl className="meta">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Generic read-only audit viewer usable by any module. */
export function AuditEventsTable({ events, showEntity = true }: { events: AuditEvent[]; showEntity?: boolean }) {
  return (
    <DataTable
      caption="Audit events"
      rows={events}
      rowKey={(e) => e.id}
      emptyMessage="No audit events match."
      columns={[
        { key: "time", header: "Time (UTC)", width: "190px", render: (e) => <code>{e.occurredAt.replace("T", " ").replace(/\.\d+Z$/, "Z")}</code> },
        { key: "action", header: "Action", render: (e) => <StatusBadge value={e.action} tone="info" /> },
        ...(showEntity
          ? [{ key: "entity", header: "Entity", render: (e: AuditEvent) => <span>{e.entityType} · <strong>{e.entityId}</strong></span> }]
          : []),
        { key: "actor", header: "Actor", render: (e) => <span>{e.actorName ?? "Unknown"} <span className="muted">({e.actorId})</span></span> },
        { key: "meta", header: "Metadata", render: (e) => <MetadataView metadata={e.metadata} /> },
        { key: "id", header: "Event ID", render: (e) => <code className="small">{e.id}</code> },
      ]}
    />
  );
}
