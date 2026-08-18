"use client";

// The discipline mechanic behind the queue.
//
// Tapping "התקשר" or "וואטסאפ" hands the phone off to another app. The moment
// the user comes back, one sheet asks what happened — and a queue item is
// cleared only by an answer to it. That is the difference between a queue and
// a list you scroll past.
//
// The armed intent survives in sessionStorage because leaving for the dialler
// can tear down the page on mobile Safari; it must still be waiting on return.

import { useCallback, useEffect, useRef, useState } from "react";
import type { OutreachChannel } from "./types";

const STORAGE_KEY = "gt.sales.outreach";

/** Returning within a second or two means the call never happened — the user
 *  bounced off their own screen. Tests lower this via the window hook. */
const DEFAULT_RETURN_DELAY_MS = 5_000;

declare global {
  interface Window {
    __GT_SALES_OUTCOME_DELAY_MS__?: number;
  }
}

function returnDelayMs(): number {
  if (typeof window === "undefined") return DEFAULT_RETURN_DELAY_MS;
  return window.__GT_SALES_OUTCOME_DELAY_MS__ ?? DEFAULT_RETURN_DELAY_MS;
}

export interface ArmedOutreach {
  leadId: string;
  channel: OutreachChannel;
  at: number;
}

function readArmed(): ArmedOutreach | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArmedOutreach;
    if (!parsed?.leadId || !parsed?.channel) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeArmed(value: ArmedOutreach | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the sheet simply will not survive a reload */
  }
}

export interface OutcomeCapture {
  /** Set once the user is back and an outcome is owed. */
  pending: ArmedOutreach | null;
  /** Call on tap, before the browser follows the tel:/wa.me link. */
  arm: (leadId: string, channel: OutreachChannel) => void;
  /** Only a captured outcome clears the intent. Dismissal does not. */
  clear: () => void;
  /**
   * Closes the sheet without answering it. The intent stays in storage, so the
   * next return to the app asks again — which is the point: a queue item is
   * cleared by an outcome, never by looking away.
   */
  dismiss: () => void;
}

export function useOutcomeCapture(): OutcomeCapture {
  const [pending, setPending] = useState<ArmedOutreach | null>(null);
  // Set when the sheet is closed without an answer. The intent is still owed,
  // but it must not spring straight back: the browser fires a window focus for
  // an ordinary click, and re-raising the sheet on that would make dismissal
  // feel broken. It returns after a real trip away from the app.
  const dismissedRef = useRef(false);

  const arm = useCallback((leadId: string, channel: OutreachChannel) => {
    writeArmed({ leadId, channel, at: Date.now() });
    dismissedRef.current = false;
    setPending(null);
  }, []);

  const clear = useCallback(() => {
    writeArmed(null);
    dismissedRef.current = false;
    setPending(null);
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    setPending(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const check = () => {
      if (document.visibilityState === "hidden") {
        // Leaving the app is what re-qualifies a dismissed intent.
        dismissedRef.current = false;
        return;
      }
      if (dismissedRef.current) return;
      const armed = readArmed();
      if (!armed) return;
      if (Date.now() - armed.at < returnDelayMs()) return;
      setPending(armed);
    };

    // An intent armed before a reload is still owed an answer.
    check();

    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return { pending, arm, clear, dismiss };
}
