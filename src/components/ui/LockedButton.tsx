"use client";

import type { ButtonHTMLAttributes } from "react";
import { useLockedWidth } from "./useLockedWidth";

/**
 * A plain <button> that keeps its width while `pending`, for a button that
 * is rendered inside a map or a conditional where its own hook cannot live.
 * `pending` only locks the width; the caller still sets `disabled` and
 * `aria-busy`.
 */
export function LockedButton({
  pending,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean }) {
  const ref = useLockedWidth<HTMLButtonElement>(pending);
  return <button ref={ref} type={type} {...rest} />;
}
