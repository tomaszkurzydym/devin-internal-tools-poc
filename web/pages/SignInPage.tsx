import { useState } from "react";
import { Button } from "../components/Form";
import { ErrorState, Loading } from "../components/States";
import { RoleBadge } from "../components/StatusBadge";
import { useSession } from "../core/session";
import { useApi } from "../core/useApi";

interface DemoUser { id: string; name: string; role: string }

export function SignInPage() {
  const { signIn } = useSession();
  const { data, error } = useApi<{ users: DemoUser[] }>("/api/demo-users");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  return (
    <div className="signin">
      <div className="card signin-card">
        <h1>Internal Tools · Demo sign-in</h1>
        <div className="notice notice-error" role="note">
          <span>
            <strong>Simulation only.</strong> This identity selector creates a server-side demo session. It is not
            authentication and must be replaced with real SSO before any deployment.
          </span>
        </div>
        {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
          <ul className="user-picker">
            {data.users.map((u) => (
              <li key={u.id}>
                <div>
                  <strong>{u.name}</strong> <RoleBadge role={u.role} />
                </div>
                <Button
                  busy={busy === u.id}
                  onClick={async () => {
                    setBusy(u.id);
                    setFailure(null);
                    try { await signIn(u.id); } catch (e) { setFailure(e as Error); } finally { setBusy(null); }
                  }}
                >
                  Continue as {u.name.split(" ")[0]}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {failure && <ErrorState error={failure} />}
      </div>
    </div>
  );
}
