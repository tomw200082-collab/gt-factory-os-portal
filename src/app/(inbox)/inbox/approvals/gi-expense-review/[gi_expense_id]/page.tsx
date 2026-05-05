"use client";

// Stage B form drawer — convert a to_do:gi_expense_review card into a
// price-update proposal.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.14.2
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 5.1

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  InboxCard,
  PrimaryActionButton,
  SecondaryActionButton,
} from "@/components/inbox/InboxCard";
import { DIALOG_COPY, STATE_COPY } from "@/lib/inbox-copy";

type Mode = "quantity_units" | "unit_price_net_override";

interface SubmitResponse {
  outcome: "tier_1_auto" | "tier_2_proposed" | "tier_3_anomaly";
  proposal_id?: string;
  decision_exception_id?: string;
  warning_exception_id?: string;
  resolved_to_do_exception_id: string;
  proposed_unit_price_net: string;
  current_unit_price_net: string | null;
  pct_delta: string;
  abs_delta_money: string;
  confidence: "HIGH" | "MEDIUM";
  tier: "tier_1" | "tier_2" | "tier_3";
}

export default function GiExpenseReviewDrawerPage() {
  const router = useRouter();
  const params = useParams<{ gi_expense_id: string }>();
  const giExpenseId = params.gi_expense_id;

  const [supplierItemId, setSupplierItemId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("quantity_units");
  const [quantityUnits, setQuantityUnits] = useState<string>("");
  const [unitPriceOverride, setUnitPriceOverride] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: async (): Promise<SubmitResponse> => {
      const body: Record<string, unknown> = {
        idempotency_key: `gi-expense-review:${giExpenseId}:${Date.now()}`,
        supplier_item_id: supplierItemId,
        notes: notes || undefined,
      };
      if (mode === "quantity_units") {
        body.quantity_units = Number(quantityUnits);
      } else {
        body.unit_price_net_override = Number(unitPriceOverride);
      }
      const r = await fetch(
        `/api/v1/mutations/inbox/gi-expense-review/${encodeURIComponent(giExpenseId)}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `${r.status} ${r.statusText}`);
      }
      return (await r.json()) as SubmitResponse;
    },
    onSuccess: (data) => {
      // Tier 1 → straight to /inbox; Tier 2 → drawer of new Decision card; Tier 3 → /inbox.
      if (data.outcome === "tier_2_proposed" && data.decision_exception_id) {
        router.push(
          `/inbox/approvals/gi-price-proposal/${data.proposal_id ?? ""}`,
        );
      } else {
        router.push("/inbox");
      }
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const xorOk =
    (mode === "quantity_units" && quantityUnits.trim().length > 0) ||
    (mode === "unit_price_net_override" && unitPriceOverride.trim().length > 0);
  const canSubmit = supplierItemId.trim().length > 0 && xorOk && !submitMut.isPending;

  return (
    <main className="mx-auto max-w-2xl py-6 space-y-4" dir="rtl">
      <header>
        <h1 className="text-lg font-semibold">בדיקת חשבונית מ-Green Invoice</h1>
        <p className="text-xs text-slate-500" dir="ltr">
          gi_expense_id={giExpenseId}
        </p>
      </header>

      <InboxCard
        cardType="to_do"
        subtype="gi_expense_review"
        severity="info"
        subject="טופס המרת חשבונית להצעת עדכון מחיר"
        createdAt={new Date().toISOString()}
        status="open"
        mode="drawer"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submitMut.mutate();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              פריט ספק (supplier_item_id)
            </label>
            <input
              type="text"
              value={supplierItemId}
              onChange={(e) => setSupplierItemId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              dir="ltr"
              placeholder="UUID"
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              הוזן ידנית בגרסה זו. בעתיד יבחר מ-dropdown מתוך פריטי הספק
              הפעילים (key_facts.prefill_supplier_item_id).
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-500 mb-1">
              מצב חישוב
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "quantity_units"}
                onChange={() => setMode("quantity_units")}
              />
              <span>מצב כמות (המערכת תחשב מחיר ליחידה)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "unit_price_net_override"}
                onChange={() => setMode("unit_price_net_override")}
              />
              <span>הזנת מחיר ליחידה ישירות</span>
            </label>
          </fieldset>

          {mode === "quantity_units" ? (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                כמות ביחידות הזמנה
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={quantityUnits}
                onChange={(e) => setQuantityUnits(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums"
                dir="ltr"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                כמות הרכישה ביחידות הזמנה (Order UOM של ה-supplier_item).
                דוגמה: אם הספק חייב 5,000 מדבקות והפריט מוגדר ב-Order UOM
                'יחידה' — הזן 5000. המערכת תחשב מחיר ליחידה אוטומטית
                על-בסיס סכום החשבונית.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                מחיר ליחידה (₪, נטו)
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={unitPriceOverride}
                onChange={(e) => setUnitPriceOverride(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums"
                dir="ltr"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              הערות (אופציונלי)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-700 bg-red-50 rounded-md p-2">
              {DIALOG_COPY.toastInvalidInput}: {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2 pt-2">
            <PrimaryActionButton
              onClick={() => {
                if (canSubmit) submitMut.mutate();
              }}
              disabled={!canSubmit}
            >
              {submitMut.isPending ? STATE_COPY.loadingDrawer : "שלח"}
            </PrimaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/inbox")}>
              ביטול
            </SecondaryActionButton>
          </div>
        </form>
      </InboxCard>
    </main>
  );
}
