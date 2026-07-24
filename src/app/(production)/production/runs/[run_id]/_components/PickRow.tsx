"use client";

// ---------------------------------------------------------------------------
// PickRow — the hero of the picking screen. One material, big and calm:
//   • the material name large (Hebrew secondary line when the data has one)
//   • the required BOM quantity prefilled in tabular mono — the number IS the
//     edit affordance (tap it to change the actual amount)
//   • tap the row body to confirm "got it as stated" → a satisfying ✓ fill
//   • shortage / excess / not-taken never block — each only flags (icon+word,
//     never colour alone)
//
// Two side-by-side tap targets (both ≥44px): the confirm body (left) and the
// number (right). No nested buttons.
// ---------------------------------------------------------------------------

import { AlertTriangle, Check, CircleSlash, Pencil, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../_lib/copy";
import { requiredNum, rowSignals, type PickResolution } from "../_lib/pick";
import type { PickListLine } from "../../../_lib/types";

export function PickRow({
  line,
  resolution,
  onConfirm,
  onEdit,
  disabled = false,
}: {
  line: PickListLine;
  resolution?: PickResolution;
  onConfirm: () => void;
  onEdit: () => void;
  disabled?: boolean;
}) {
  const state = resolution?.state;
  const confirmed = state === "PICKED";
  const edited = state === "EDITED";
  const notTaken = state === "NOT_COLLECTED";
  const resolved = resolution != null;
  const { shortage, excess } = rowSignals(line, resolution);

  // The big number: what they took once resolved, else the prefilled requirement.
  const shownQty = resolved ? resolution!.picked_qty : requiredNum(line);

  // Tranche 143 (migration 0296): floor_name is a Latin-script display name
  // for the weak Hebrew/English reader. When present it becomes the big
  // primary name and component_name (Hebrew) drops to the small secondary
  // line; when absent, component_name stays primary (unchanged behavior).
  const displayName = line.floor_name ?? line.component_name;
  const secondaryName = line.floor_name ? line.component_name : line.name_he;

  // State-sensitive action name for AT (A11Y-005) — the visible inner text of
  // the confirm button is decorative under an explicit aria-label, so the
  // label must carry the current resolution AND the shortage/excess flags
  // (A11Y-004: the flags used to live inside the button and were ignored).
  const statePhrase = confirmed
    ? t("pick_row_ok")
    : edited
      ? `${t("pick_row_changed_to")} ${fmtNumStr(String(shownQty))} ${line.uom}`
      : notTaken
        ? t("pick_row_not_collected")
        : t("pick_row_confirm");
  const confirmAriaLabel = [
    `${displayName} — ${statePhrase}`,
    shortage ? t("pick_row_missing") : null,
    excess ? t("pick_row_extra") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-testid={`pick-row-${line.source}-${line.component_id}`}
      data-state={state ?? "unresolved"}
      className={cn(
        "card flex items-stretch gap-0 overflow-hidden p-0 transition-colors duration-200 motion-reduce:transition-none",
        confirmed && "border-success/50 bg-success-softer/30",
        notTaken && "border-border/60 bg-bg-subtle/40",
        edited && "border-info/40",
      )}
    >
      {/* Confirm body — tap = "got it as stated" */}
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        aria-pressed={confirmed ? true : undefined}
        aria-label={confirmAriaLabel}
        data-testid={`pick-confirm-${line.source}-${line.component_id}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition-colors motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
          !disabled && !confirmed && "hover:bg-bg-subtle/50",
          disabled && "cursor-default",
        )}
      >
        {/* Check medallion — the satisfying confirm state */}
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 motion-reduce:transition-none",
            confirmed
              ? "scale-100 border-success bg-success text-fg-inverted"
              : "border-border bg-bg text-transparent",
          )}
        >
          <Check
            className={cn(
              "h-6 w-6 transition-transform duration-200 motion-reduce:transition-none",
              confirmed ? "scale-100" : "scale-50",
            )}
            strokeWidth={3}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-fg-strong sm:text-lg">
            {displayName}
          </span>
          {secondaryName ? (
            <span className="block truncate text-xs text-fg-muted">
              <bdi>{secondaryName}</bdi>
            </span>
          ) : null}

          {/* Status line under the name */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {confirmed ? (
              <span className="inline-flex items-center gap-1 font-semibold text-success-fg">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                {t("pick_row_ok")}
              </span>
            ) : notTaken ? (
              <span className="inline-flex items-center gap-1 font-semibold text-fg-muted">
                <CircleSlash className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                {t("pick_row_not_collected")}
              </span>
            ) : (
              <span className="text-fg-muted">
                {t("pick_need")}{" "}
                <span className="font-mono font-semibold tabular-nums text-fg">
                  {fmtNumStr(line.required_qty)} {line.uom}
                </span>
              </span>
            )}
            {shortage ? (
              <Badge
                tone="warning"
                size="xs"
                icon={<AlertTriangle className="h-3 w-3" strokeWidth={2.5} />}
              >
                {t("pick_row_missing")}
              </Badge>
            ) : null}
            {excess ? (
              <Badge
                tone="info"
                size="xs"
                icon={<TrendingUp className="h-3 w-3" strokeWidth={2.5} />}
              >
                {t("pick_row_extra")}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>

      {/* Number — tap = edit the actual amount */}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`${t("pick_edit_title")} ${displayName}`}
        data-testid={`pick-edit-${line.source}-${line.component_id}`}
        className={cn(
          "flex w-24 shrink-0 flex-col items-center justify-center border-l border-border/70 px-1 py-2 transition-colors motion-reduce:transition-none sm:w-28",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
          !disabled && "hover:bg-accent-soft/60",
          disabled && "cursor-default",
        )}
      >
        <span
          className={cn(
            "font-mono text-3xl font-bold leading-none tabular-nums sm:text-4xl",
            notTaken ? "text-fg-subtle line-through" : "text-fg-strong",
          )}
        >
          {fmtNumStr(String(shownQty))}
        </span>
        <span className="mt-0.5 text-2xs font-medium text-fg-muted">{line.uom}</span>
        {!disabled ? (
          <span className="mt-1 inline-flex items-center gap-1 text-2xs font-semibold text-accent">
            <Pencil className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {t("pick_change")}
          </span>
        ) : null}
      </button>
    </div>
  );
}
