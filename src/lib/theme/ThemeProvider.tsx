"use client";

// ThemeProvider — applies the user's theme_preference to the <html> element
// and exposes a useTheme() hook for the toggle button in TopBar.
//
// Behavior:
//   - On mount, reads useSession().session.theme_preference. When session is
//     loading, leaves <html> in its default (light) state — Q7=A locked
//     behavior: a brief flash of light on first authenticated paint is
//     accepted and not engineered around.
//   - When the user toggles, the class is flipped optimistically and
//     POST /api/me/set-theme is fired. On hard error the toggle reverts.
//   - /login renders without ThemeProvider being mounted at all (auth-gated
//     layout doesn't include it), so /login is always light.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth/session-provider";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  const [theme, setThemeState] = useState<Theme>("light");

  // Apply the persisted preference once the session has loaded.
  useEffect(() => {
    if (isLoading) return;
    const initial: Theme =
      session.theme_preference === "dark" ? "dark" : "light";
    setThemeState(initial);
    applyClass(initial);
  }, [isLoading, session.theme_preference]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyClass(next);
    // Best-effort persist. /api/me/set-theme proxies to the Fastify backend.
    void fetch("/api/me/set-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).then(
      (res) => {
        if (!res.ok) {
          // Hard failure — revert UI to keep state and DB consistent.
          const prev: Theme = next === "dark" ? "light" : "dark";
          setThemeState(prev);
          applyClass(prev);
        }
      },
      () => {
        const prev: Theme = next === "dark" ? "light" : "dark";
        setThemeState(prev);
        applyClass(prev);
      },
    );
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
