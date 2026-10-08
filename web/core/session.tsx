import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "./api";

export type Role = "viewer" | "reviewer" | "admin";
export type { Permission } from "../../shared/permissions";
import type { Permission } from "../../shared/permissions";
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
interface SessionState {
  user: SessionUser | null;
  permissions: Permission[];
  loading: boolean;
  can: (p: Permission) => boolean;
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/** UI-side view of the server session. Only used for display; the server enforces permissions. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<{ user: SessionUser; permissions: Permission[] }>("/api/session");
      setUser(s.user);
      setPermissions(s.permissions);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: SessionState = {
    user,
    permissions,
    loading,
    can: (p) => permissions.includes(p),
    signIn: async (userId) => {
      await api.post("/api/session", { userId });
      await refresh();
    },
    signOut: async () => {
      await api.del("/api/session");
      await refresh();
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
