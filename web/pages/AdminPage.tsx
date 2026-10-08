import { PageHeader } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { ErrorState, Loading } from "../components/States";
import { RoleBadge } from "../components/StatusBadge";
import type { SessionUser } from "../core/session";
import { useApi } from "../core/useApi";

interface Overview {
  users: SessionUser[];
  roles: string[];
  matrix: { permission: string; description: string; roles: Record<string, boolean> }[];
}

/** Read-only. Data comes from an admin-only endpoint, so direct navigation by non-admins shows a 403. */
export function AdminPage() {
  const { data, error } = useApi<Overview>("/api/admin/overview");
  if (error) return <ErrorState error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title="Admin" subtitle="Read-only view of seeded demo users and the central permission policy. User management is out of scope." />
      <section className="card">
        <h2>Users</h2>
        <DataTable
          rows={data.users}
          rowKey={(u) => u.id}
          columns={[
            { key: "id", header: "ID", render: (u) => <code>{u.id}</code> },
            { key: "name", header: "Name", render: (u) => u.name },
            { key: "email", header: "Email", render: (u) => u.email },
            { key: "role", header: "Role", render: (u) => <RoleBadge role={u.role} /> },
          ]}
        />
      </section>
      <section className="card">
        <h2>Permission matrix</h2>
        <DataTable
          rows={data.matrix}
          rowKey={(m) => m.permission}
          columns={[
            { key: "p", header: "Permission", render: (m) => <><code>{m.permission}</code><div className="muted small">{m.description}</div></> },
            ...data.roles.map((r) => ({
              key: r,
              header: r,
              render: (m: Overview["matrix"][number]) => (m.roles[r] ? <span className="yes">✔ Allowed</span> : <span className="no">— Denied</span>),
            })),
          ]}
        />
      </section>
    </>
  );
}
