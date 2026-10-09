import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Loading } from "./components/States";
import { SessionProvider, useSession } from "./core/session";
import { FeatureFlagDetailPage } from "./modules/flags/FeatureFlagDetailPage";
import { FeatureFlagsPage } from "./modules/flags/FeatureFlagsPage";
import { KycDetailPage } from "./modules/kyc/KycDetailPage";
import { KycQueuePage } from "./modules/kyc/KycQueuePage";
import { RefundDetailPage } from "./modules/refunds/RefundDetailPage";
import { RefundsQueuePage } from "./modules/refunds/RefundsQueuePage";
import { AdminPage } from "./pages/AdminPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { SignInPage } from "./pages/SignInPage";

function AuthedApp() {
  const { user, loading } = useSession();
  if (loading) return <Loading label="Loading session…" />;
  if (!user) return <SignInPage />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/kyc" replace />} />
        <Route path="/kyc" element={<KycQueuePage />} />
        <Route path="/kyc/:id" element={<KycDetailPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        {/* Rendered for everyone on purpose: the server decides (403 for non-admins). */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/refunds" element={<RefundsQueuePage />} />
        <Route path="/refunds/:id" element={<RefundDetailPage />} />
        <Route path="/feature-flags" element={<FeatureFlagsPage />} />
        <Route path="/feature-flags/:id" element={<FeatureFlagDetailPage />} />
        <Route path="*" element={<div className="state state-empty">Page not found.</div>} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <SessionProvider>
      <AuthedApp />
    </SessionProvider>
  );
}
