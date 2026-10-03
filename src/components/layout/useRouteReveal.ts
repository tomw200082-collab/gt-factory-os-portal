"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

/**
 * The content reveal (`.gt-reveal`, an opacity fade over --motion-base) runs
 * once per route mount. Put the class on the shell's <main> and the ref from
 * this hook on the same element:
 *
 *   const ref = useRouteReveal<HTMLElement>();
 *   <main ref={ref} className="... gt-reveal">
 *
 * The first mount plays it by itself (the class is in the markup). When the
 * pathname changes, the animation is restarted in place: no remount, so nested
 * layouts keep their state. A refetch or a rerender never touches it.
 */
export function useRouteReveal<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const el = ref.current;
    if (!el) return;
    el.classList.remove("gt-reveal");
    void el.offsetWidth; // flush, so re-adding the class restarts the animation
    el.classList.add("gt-reveal");
  }, [pathname]);

  return ref;
}
