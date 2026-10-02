"use client";

import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `ms`. Search asks the server per pause, not per key. */
export function useDebounced<T>(value: T, ms = 220): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
