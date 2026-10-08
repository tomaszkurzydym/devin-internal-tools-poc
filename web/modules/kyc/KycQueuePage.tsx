import { Link } from "react-router-dom";
import { PageHeader } from "../../components/AppShell";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { formatDateTime } from "../../components/Form";
import { ErrorState, Loading } from "../../components/States";
import { StatusBadge } from "../../components/StatusBadge";
import { qs } from "../../core/api";
import { useApi } from "../../core/useApi";
import { useUrlFilters } from "../../core/useUrlFilters";
import { KYC_STATUSES, RISK_LEVELS, type KycApplication } from "./types";

export function KycQueuePage() {
  const { filters, set, clear } = useUrlFilters(["q", "status", "risk"] as const);
  const { data, error, loading, reload } = useApi<{ applications: KycApplication[] }>(
    `/api/kyc/applications${qs(filters)}`,
  );

  return (
    <>
      <PageHeader title="KYC Reviews" subtitle="Synthetic applications awaiting identity verification review." />
      <FilterBar
        values={filters}
        onChange={set}
        onClear={clear}
        searchName="q"
        searchPlaceholder="Search by applicant name or application ID"
        selects={[
          { name: "status", label: "Status", options: KYC_STATUSES },
          { name: "risk", label: "Risk", options: RISK_LEVELS },
        ]}
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Loading />
      ) : (
        <>
          <p className="muted small">{data?.applications.length ?? 0} application(s)</p>
          <DataTable
            caption="KYC applications"
            rows={data?.applications ?? []}
            rowKey={(a) => a.id}
            emptyMessage="No applications match these filters."
            columns={[
              { key: "id", header: "Application", render: (a) => <Link to={`/kyc/${a.id}`}>{a.id}</Link> },
              { key: "name", header: "Applicant", render: (a) => a.applicantName },
              { key: "country", header: "Country", render: (a) => a.country },
              { key: "submitted", header: "Submitted", render: (a) => formatDateTime(a.submittedAt) },
              { key: "risk", header: "Risk", render: (a) => <StatusBadge value={a.riskLevel} /> },
              { key: "status", header: "Status", render: (a) => <StatusBadge value={a.status} /> },
              { key: "flags", header: "Risk flags", render: (a) => a.riskFlags.length || <span className="muted">0</span> },
            ]}
          />
        </>
      )}
    </>
  );
}
