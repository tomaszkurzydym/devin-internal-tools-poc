import { Link } from "react-router-dom";
import { PageHeader } from "../../components/AppShell";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { formatDateTime } from "../../components/Form";
import { ErrorState, Loading } from "../../components/States";
import { StatusBadge, humanize } from "../../components/StatusBadge";
import { qs } from "../../core/api";
import { useApi } from "../../core/useApi";
import { useUrlFilters } from "../../core/useUrlFilters";
import { FLAG_STATUSES, OWNER_TEAMS, type FeatureFlag } from "./types";

export function FeatureFlagsPage() {
  const { filters, set, clear } = useUrlFilters(["q", "status", "team"] as const);
  const { data, error, loading, reload } = useApi<{ flags: FeatureFlag[] }>(`/api/feature-flags/flags${qs(filters)}`);

  return (
    <>
      <PageHeader
        title="Feature Flags"
        subtitle="Synthetic production flags. Changes here update this prototype only; no flag service is connected."
      />
      <FilterBar
        values={filters}
        onChange={set}
        onClear={clear}
        searchName="q"
        searchPlaceholder="Search by flag key, name or ID"
        selects={[
          { name: "status", label: "Status", options: FLAG_STATUSES },
          { name: "team", label: "Team", options: OWNER_TEAMS },
        ]}
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Loading />
      ) : (
        <>
          <p className="muted small">{data?.flags.length ?? 0} flag(s)</p>
          <DataTable
            caption="Production feature flags"
            rows={data?.flags ?? []}
            rowKey={(f) => f.id}
            emptyMessage="No feature flags match these filters."
            columns={[
              { key: "key", header: "Flag", render: (f) => <Link to={`/feature-flags/${f.id}`}><code>{f.key}</code></Link> },
              { key: "name", header: "Name", render: (f) => f.name },
              { key: "team", header: "Team", render: (f) => humanize(f.ownerTeam) },
              { key: "status", header: "Production", render: (f) => <StatusBadge value={f.status} /> },
              { key: "changed", header: "Last changed", render: (f) => formatDateTime(f.lastChangedAt) },
            ]}
          />
        </>
      )}
    </>
  );
}
