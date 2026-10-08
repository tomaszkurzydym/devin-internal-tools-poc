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
import { REFUND_STATUSES, formatAmount, type RefundRequest } from "./types";

export function RefundsQueuePage() {
  const { filters, set, clear } = useUrlFilters(["q", "status"] as const);
  const { data, error, loading, reload } = useApi<{ refunds: RefundRequest[] }>(`/api/refunds/requests${qs(filters)}`);

  return (
    <>
      <PageHeader
        title="Refunds"
        subtitle="Synthetic refund requests for internal review. No payments are executed from this tool."
      />
      <FilterBar
        values={filters}
        onChange={set}
        onClear={clear}
        searchName="q"
        searchPlaceholder="Search by customer name or request ID"
        selects={[{ name: "status", label: "Status", options: REFUND_STATUSES }]}
      />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data && loading ? (
        <Loading />
      ) : (
        <>
          <p className="muted small">{data?.refunds.length ?? 0} request(s)</p>
          <DataTable
            caption="Refund requests"
            rows={data?.refunds ?? []}
            rowKey={(r) => r.id}
            emptyMessage="No refund requests match these filters."
            columns={[
              { key: "id", header: "Request", render: (r) => <Link to={`/refunds/${r.id}`}>{r.id}</Link> },
              { key: "customer", header: "Customer", render: (r) => r.customerName },
              { key: "amount", header: "Amount", render: (r) => formatAmount(r) },
              { key: "reason", header: "Reason", render: (r) => humanize(r.reason) },
              { key: "requested", header: "Requested", render: (r) => formatDateTime(r.requestedAt) },
              { key: "status", header: "Status", render: (r) => <StatusBadge value={r.status} /> },
            ]}
          />
        </>
      )}
    </>
  );
}
