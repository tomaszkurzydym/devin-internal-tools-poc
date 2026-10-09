import { PageHeader } from "../components/AppShell";
import { AuditEventsTable, type AuditEvent } from "../components/AuditEventsTable";
import { FilterBar } from "../components/FilterBar";
import { ErrorState, Loading } from "../components/States";
import { qs } from "../core/api";
import { useApi } from "../core/useApi";
import { useUrlFilters } from "../core/useUrlFilters";

export function AuditLogPage() {
  const { filters, set, clear } = useUrlFilters(["entityId", "action"] as const);
  const { data, error, loading, reload } = useApi<{ events: AuditEvent[]; actions: string[] }>(
    `/api/audit-events${qs(filters)}`,
  );
  // Server returns every registered module's actions plus any recorded ones.
  const actions = data?.actions ?? [];

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
        searchPlaceholder="Filter by record ID (e.g. KYC-1001, RF-2001, FF-3001)"
        selects={[{ name: "action", label: "Action", options: actions }]}
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data && loading ? <Loading /> : <AuditEventsTable events={data?.events ?? []} />}
    </>
  );
}
