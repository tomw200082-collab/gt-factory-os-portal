"use client";

// ---------------------------------------------------------------------------
// <QueryCountChip> — a count badge that never lies during loading.
//
// Tranche 067 (admin UX/UI audit THEME B). The list headers rendered
// `{query.data?.count ?? 0} items`, which shows "0 items" while the query is
// still loading — a false-empty signal (UX-Standard §3 requires count chips to
// be gated on `data !== undefined && !isError`).
//
// While loading: a skeleton pill (no number).
// On error / no data: an em-dash count, so the reader sees "unknown", not "0".
// On success: the real count.
// ---------------------------------------------------------------------------

import { Badge } from "@/components/badges/StatusBadge";

type Tone = "info" | "neutral" | "success" | "warning" | "danger";

export interface QueryCountChipProps {
  /** query.isLoading */
  isLoading: boolean;
  /** query.isError (optional) */
  isError?: boolean;
  /** query.data?.count — undefined until loaded */
  count: number | undefined;
  /** Pluralised noun shown after the number, e.g. "items". */
  noun: string;
  /** Badge tone when the count is known. Default "info". */
  tone?: Tone;
  /** Dotted badge style. Default true. */
  dotted?: boolean;
}

export function QueryCountChip({
  isLoading,
  isError = false,
  count,
  noun,
  tone = "info",
  dotted = true,
}: QueryCountChipProps): JSX.Element {
  if (isLoading) {
    return (
      <span
        className="inline-block h-5 w-20 animate-pulse rounded-full bg-bg-subtle align-middle"
        aria-hidden="true"
      />
    );
  }

  if (isError || count === undefined) {
    return (
      <Badge tone="neutral" dotted={dotted}>
        — {noun}
      </Badge>
    );
  }

  return (
    <Badge tone={tone} dotted={dotted}>
      {count} {noun}
    </Badge>
  );
}
