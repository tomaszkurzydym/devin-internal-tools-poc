import { PageHeader } from "../components/AppShell";
import { AuditEventsTable, type AuditEvent } from "../components/AuditEventsTable";
import { FilterBar } from "../components/FilterBar";
import { ErrorState, Loading } from "../components/States";
import { qs } from "../core/api";
import { useApi } from "../core/useApi";
import { useUrlFilters } from "../core/useUrlFilters";

const KNOWN_ACTIONS = ["kyc.review_started", "kyc.note_added", "kyc.approved", "kyc.rejected"];

export function AuditLogPage() {
  const { filters, set, clear } = useUrlFilters(["entityId", "action"] as const);
  const { data, error, loading, reload } = useApi<{ events: AuditEvent[]; actions: string[] }>(
    `/api/audit-events${qs(filters)}`,
  );
  const actions = Array.from(new Set([...KNOWN_ACTIONS, ...(data?.actions ?? [])]));

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of successful mutations, newest first. Read-only: there is no edit or delete."
      />
      <FilterBar
        values={filters}
        onChange={set}
        onClear={clear}
        searchName="entityId"
        searchPlaceholder="Filter by application ID (e.g. KYC-1001)"
        selects={[{ name: "action", label: "Action", options: actions }]}
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data && loading ? <Loading /> : <AuditEventsTable events={data?.events ?? []} />}
    </>
  );
}
