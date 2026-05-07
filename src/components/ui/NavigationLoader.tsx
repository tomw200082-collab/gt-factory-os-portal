"use client";

// NavigationLoader — shows GTLoader during client-side navigation.
//
// Problem: Next.js App Router's loading.tsx only triggers when a Server
// Component suspends. Because this portal fetches data client-side via
// TanStack Query, pages never suspend and loading.tsx is never shown.
// This component solves the problem by intercepting <a> clicks directly
// and showing the loader until the new pathname is committed.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GTLoader } from "./GTLoader";

export function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef(pathname);

  const show = useCallback(() => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setVisible(true);
    // Safety valve: always hide after 6 s even if navigation never completes.
    safetyRef.current = setTimeout(() => setVisible(false), 6000);
  }, []);

  const hide = useCallback(() => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // Brief delay so the incoming page's fade-in (page-enter) overlaps
    // with the loader disappearing — no abrupt jump.
    hideTimerRef.current = setTimeout(() => setVisible(false), 80);
  }, []);

  // Intercept any same-origin <a> click before navigation fires.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;

      const href = anchor.getAttribute("href") ?? "";
      // Only internal pathname links (starts with /).
      if (!href.startsWith("/")) return;
      // Skip if same page (hash-only or identical path).
      if (href === pathname || href.startsWith(pathname + "#")) return;
      // Skip download links.
      if (anchor.hasAttribute("download")) return;

      show();
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname, show]);

  // Hide once Next.js commits the new pathname.
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      hide();
    }
  }, [pathname, hide]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (safetyRef.current) clearTimeout(safetyRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  if (!visible) return null;
  return <GTLoader instant />;
}
