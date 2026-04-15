"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ScreenState } from "@/lib/contracts/enums";

const STORAGE_KEY = "gt.reviewmode.v1";

export interface ReviewState {
  open: boolean;
  forcedScreenState: ScreenState | null;
  fixtureSet: "default" | "sparse" | "stress" | "failure";
}

const DEFAULT: ReviewState = {
  open: false,
  forcedScreenState: null,
  fixtureSet: "default",
};

interface ReviewContextValue extends ReviewState {
  setOpen: (open: boolean) => void;
  setForcedScreenState: (s: ScreenState | null) => void;
  setFixtureSet: (f: ReviewState["fixtureSet"]) => void;
  reset: () => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

function read(): ReviewState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as ReviewState) };
  } catch {
    return DEFAULT;
  }
}

function write(state: ReviewState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function ReviewModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReviewState>(DEFAULT);

  useEffect(() => {
    setState(read());
  }, []);

  useEffect(() => {
    write(state);
  }, [state]);

  const setOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, open }));
  }, []);
  const setForcedScreenState = useCallback((forcedScreenState: ScreenState | null) => {
    setState((s) => ({ ...s, forcedScreenState }));
  }, []);
  const setFixtureSet = useCallback((fixtureSet: ReviewState["fixtureSet"]) => {
    setState((s) => ({ ...s, fixtureSet }));
  }, []);
  const reset = useCallback(() => setState(DEFAULT), []);

  const value = useMemo<ReviewContextValue>(
    () => ({
      ...state,
      setOpen,
      setForcedScreenState,
      setFixtureSet,
      reset,
    }),
    [state, setOpen, setForcedScreenState, setFixtureSet, reset]
  );

  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

export function useReviewMode(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) {
    throw new Error("useReviewMode must be used inside <ReviewModeProvider>");
  }
  return ctx;
}
