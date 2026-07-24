// ---------------------------------------------------------------------------
// Picking pure logic — grouping, per-row resolution, the resolve-gate math and
// the confirm-payload builder.
//
// No React, no I/O — the crypto key + timestamp are INJECTED into
// buildConfirmBody so the whole module is deterministic and unit-testable. The
// PickList component owns the resolutions map in React state and calls these
// helpers; it never re-implements the gate math itself.
//
// Physical truth wins: a shortage (took less than the recipe needs) or an
// excess (took more than the system thinks is on hand) never blocks the
// confirm — each is only flagged for visibility.
// ---------------------------------------------------------------------------

import type {
  PickConfirmBody,
  PickConfirmPick,
  PickListLine,
  PickState,
} from "../../../_lib/types";

/** One line's resolved answer. `null`/absent in the map = still unresolved. */
export interface PickResolution {
  state: PickState;
  /** The actual amount taken (0 for NOT_COLLECTED, required for a plain OK). */
  picked_qty: number;
}

export type ResolutionMap = Record<string, PickResolution>;

/** Stable per-line key — a component can, in principle, appear once from the
 *  base BOM and once from the pack BOM, so the source is part of the key. */
export function lineKey(line: Pick<PickListLine, "component_id" | "source">): string {
  return `${line.source}:${line.component_id}`;
}

/** Parse a NUMERIC-as-text field to a finite number, or 0 when unparseable. */
export function toNum(text: string | null | undefined): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function requiredNum(line: PickListLine): number {
  return toNum(line.required_qty);
}

export function onHandNum(line: PickListLine): number {
  return toNum(line.on_hand);
}

export interface GroupedLines {
  liquids: PickListLine[];
  packaging: PickListLine[];
}

/** Split lines into liquids (RM) above packaging (PKG), preserving input order
 *  within each group. Works for every stage — TANK yields only liquids, PACK
 *  only packaging, SINGLE both. */
export function groupPickLines(lines: readonly PickListLine[]): GroupedLines {
  const liquids: PickListLine[] = [];
  const packaging: PickListLine[] = [];
  for (const line of lines) {
    if (line.item_type === "PKG") packaging.push(line);
    else liquids.push(line);
  }
  return { liquids, packaging };
}

// ── resolution builders — one per operator action ──────────────────────────

/** Tap the row: "got it as stated" → PICKED at the required amount. */
export function confirmResolution(line: PickListLine): PickResolution {
  return { state: "PICKED", picked_qty: requiredNum(line) };
}

/** Edit the number: derive the state from the amount. 0 (or less) means the
 *  operator explicitly did not take it; exactly the required amount collapses
 *  back to a plain PICKED; anything else is an EDITED actual. */
export function editResolution(line: PickListLine, qty: number): PickResolution {
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (q <= 0) return { state: "NOT_COLLECTED", picked_qty: 0 };
  if (q === requiredNum(line)) return { state: "PICKED", picked_qty: q };
  return { state: "EDITED", picked_qty: q };
}

/** "I did not take this" → explicit zero. */
export function notCollectedResolution(): PickResolution {
  return { state: "NOT_COLLECTED", picked_qty: 0 };
}

export interface RowSignals {
  /** Took less than the recipe needs (edited below required). */
  shortage: boolean;
  /** Took more than the system believes is on hand. */
  excess: boolean;
}

/** Compute the flags for a resolved row. Both can be false (clean), and — when
 *  on-hand is below the requirement — both can even be true at once. Never
 *  blocks; purely advisory. */
export function rowSignals(
  line: PickListLine,
  resolution: PickResolution | undefined,
): RowSignals {
  if (!resolution) return { shortage: false, excess: false };
  const shortage =
    resolution.state === "EDITED" && resolution.picked_qty < requiredNum(line);
  const excess =
    resolution.state !== "NOT_COLLECTED" &&
    resolution.picked_qty > onHandNum(line);
  return { shortage, excess };
}

// ── gate math ──────────────────────────────────────────────────────────────

export function isResolved(
  line: PickListLine,
  resolutions: ResolutionMap,
): boolean {
  return resolutions[lineKey(line)] != null;
}

export function resolvedCount(
  lines: readonly PickListLine[],
  resolutions: ResolutionMap,
): number {
  return lines.reduce(
    (n, line) => n + (resolutions[lineKey(line)] != null ? 1 : 0),
    0,
  );
}

export function unresolvedCount(
  lines: readonly PickListLine[],
  resolutions: ResolutionMap,
): number {
  return lines.length - resolvedCount(lines, resolutions);
}

/** The "Done collecting" gate: every line must be confirmed, edited, or marked
 *  not-taken. Empty line sets never gate open. */
export function allResolved(
  lines: readonly PickListLine[],
  resolutions: ResolutionMap,
): boolean {
  return lines.length > 0 && unresolvedCount(lines, resolutions) === 0;
}

// ── confirm-payload builder ────────────────────────────────────────────────

/** Map every line to its pick. Throws when a line is unresolved — callers gate
 *  on allResolved() first, so a throw here means a real state-machine bug. */
export function buildPicks(
  lines: readonly PickListLine[],
  resolutions: ResolutionMap,
): PickConfirmPick[] {
  return lines.map((line) => {
    const r = resolutions[lineKey(line)];
    if (r == null) {
      throw new Error(`Unresolved pick line: ${lineKey(line)}`);
    }
    return {
      component_id: line.component_id,
      source: line.source,
      picked_qty: r.picked_qty,
      state: r.state,
    };
  });
}

export interface BuildConfirmBodyArgs {
  lines: readonly PickListLine[];
  resolutions: ResolutionMap;
  packBomVersionId: string | null;
  baseBomVersionId: string | null;
  idempotencyKey: string;
  eventAt: string;
}

/** Build the full POST body for pick-confirm. Pure: the idempotency key and
 *  event timestamp are supplied by the caller (crypto.randomUUID / new Date at
 *  the edge), never generated here. */
export function buildConfirmBody(args: BuildConfirmBodyArgs): PickConfirmBody {
  return {
    idempotency_key: args.idempotencyKey,
    event_at: args.eventAt,
    pack_bom_version_id: args.packBomVersionId,
    base_bom_version_id: args.baseBomVersionId,
    picks: buildPicks(args.lines, args.resolutions),
  };
}
