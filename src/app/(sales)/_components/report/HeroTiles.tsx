"use client";

import type { ChipTone } from "../../_lib/report/format";

export interface Tile {
  label: string;
  value: string;
  /** a chip under the value; `mt` is the quiet one that states a fact rather than a change */
  delta?: { text: string; tone: ChipTone | "mt" } | null;
}

const CHIP: Record<ChipTone | "mt", string> = { up: "s-rp-chip s-rp-chip-up", dn: "s-rp-chip s-rp-chip-dn", mt: "s-rp-chip" };

/** "-14% מול אשתקד": the signed number is its own left-to-right run, or the minus lands after the digits in a right-to-left line. */
function DeltaText({ text }: { text: string }) {
  const m = /^([+-]?\d[\d,.]*%)(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <bdi dir="ltr">{m[1]}</bdi>
      {m[2]}
    </>
  );
}

/** Four figures to open a tab on: two across on a phone, four across from tablet width. */
export function HeroTiles({ tiles, testId }: { tiles: readonly Tile[]; testId: string }) {
  return (
    <div className="s-rp-tiles" data-testid={testId}>
      {tiles.map((t) => (
        <div key={t.label} className="s-card s-card-accent s-enter s-rp-tile" data-testid="report-tile">
          <span className="s-rp-tile-label" data-testid="tile-label">
            {t.label}
          </span>
          <b className="s-rp-tile-value s-nums" data-testid="tile-value">
            <bdi>{t.value}</bdi>
          </b>
          {t.delta ? (
            <span className={CHIP[t.delta.tone]} data-testid="tile-delta">
              <DeltaText text={t.delta.text} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
