import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../core/nav";
import { useSession } from "../core/session";
import { RoleBadge } from "./StatusBadge";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, can, signOut } = useSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Internal Tools</div>
        <nav aria-label="Main">
          {NAV_ITEMS.filter((i) => !i.permission || can(i.permission)).map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {item.label}
              {item.comingSoon && <span className="pill">Coming soon</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="demo-flag" title="Demo identity selection is a simulation and must be replaced with real authentication before any deployment.">
            DEMO IDENTITY · synthetic data only
          </span>
          {user && (
            <div className="current-user" data-testid="current-user">
              <span>{user.name}</span>
              <RoleBadge role={user.role} />
              <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
                Switch user
              </button>
            </div>
          )}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
