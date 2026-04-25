"use client";

// ---------------------------------------------------------------------------
// SessionProvider — bridges the real Supabase session + private_core.app_users
// role into React context for every client component that calls useSession().
//
// Priority order:
//   1. Production path (NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH !== "true"):
//      Fetch /api/me once on mount. /api/me proxies to the Fastify API's
//      GET /api/v1/queries/me which reads the Supabase JWT → app_users row
//      and projects {user_id, email, display_name, role}.
//   2. Dev-shim path (NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true"):
//      Use the fake-auth localStorage machinery for role switching in tests.
//
// Fix history:
//   - 2026-04-21 hotfix: previously read getDevShimSession() unconditionally,
//     which returned FAKE_USERS.viewer when dev-shim was off. Every page
//     thought the user was a viewer regardless of their actual app_users
//     role. Replaced with a real /api/me fetch for the production path.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  FAKE_USERS,
  getDevShimSession,
  isFakeAuthEnabled,
  setFakeRole,
  subscribeDevShimSession,
  type DevShimSession,
} from "./fake-auth";
import type { Role } from "@/lib/contracts/enums";

interface SessionContextValue {
  session: DevShimSession;
  setRole: (role: Role) => void;
  availableRoles: Role[];
  isLoading: boolean;
  loadError: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// A neutral placeholder used ONLY while /api/me is in-flight on first render.
// No role grants until the real session lands.
const LOADING_SESSION: DevShimSession = {
  user_id: "",
  display_name: "",
  email: "",
  role: "viewer",
};

async function fetchRealSession(): Promise<DevShimSession> {
  const res = await fetch("/api/me", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Could not load your session. Check your connection and try refreshing.");
  }
  const data = (await res.json()) as {
    user_id: string;
    email: string;
    display_name: string;
    role: Role;
  };
  return {
    user_id: data.user_id,
    email: data.email,
    display_name: data.display_name,
    role: data.role,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const devShim = isFakeAuthEnabled();

  const [session, setSession] = useState<DevShimSession>(() =>
    devShim ? FAKE_USERS.planner : LOADING_SESSION,
  );
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (devShim) {
      // Dev mode: honor localStorage + role switcher.
      setSession(getDevShimSession());
      setHydrated(true);
      const unsub = subscribeDevShimSession((s) => {
        if (!cancelled) setSession(s);
      });
      return () => {
        cancelled = true;
        unsub();
      };
    }

    // Production mode: fetch real session from /api/me once on mount.
    fetchRealSession()
      .then((s) => {
        if (!cancelled) {
          setSession(s);
          setHydrated(true);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message);
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [devShim]);

  const setRole = useCallback((role: Role) => {
    // Only functional when dev-shim is on. In production identity is owned
    // by Supabase Auth; role switching requires logging in as a different
    // user.
    setFakeRole(role);
  }, []);

  const value: SessionContextValue = {
    session,
    setRole,
    availableRoles: ["operator", "planner", "admin", "viewer"],
    isLoading: !hydrated,
    loadError,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}
