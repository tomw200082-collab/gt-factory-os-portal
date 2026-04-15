"use client";

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
  getFakeSession,
  setFakeRole,
  subscribeFakeSession,
  type FakeSession,
} from "./fake-auth";
import type { Role } from "@/lib/contracts/enums";

interface SessionContextValue {
  session: FakeSession;
  setRole: (role: Role) => void;
  availableRoles: Role[];
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<FakeSession>(() => FAKE_USERS.planner);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(getFakeSession());
    setHydrated(true);
    return subscribeFakeSession(setSession);
  }, []);

  const setRole = useCallback((role: Role) => {
    setFakeRole(role);
  }, []);

  const value: SessionContextValue = {
    session: hydrated ? session : FAKE_USERS.planner,
    setRole,
    availableRoles: ["operator", "planner", "admin", "viewer"],
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
