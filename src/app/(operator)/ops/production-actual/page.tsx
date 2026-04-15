"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, FieldGrid } from "@/components/workflow/FieldGrid";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { DateTimeInput } from "@/components/fields/DateTimeInput";
import { QuantityInput } from "@/components/fields/QuantityInput";
import { NotesBox } from "@/components/fields/NotesBox";
import { ApprovalBanner } from "@/components/workflow/ApprovalBanner";

export default function ProductionActualPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Operator form (v1.1)"
        title="Production Actual"
        description="Operator reports produced output + scrap. Standard consumption is computed from the pinned BOM version. Manual per-component consumption is out of scope for v1."
      />

      <ApprovalBanner
        tone="info"
        title="v1.1 slice — shell only"
        reason="Ledger semantics for production consumption are deferred to Window 1 for v1.1."
      />

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <SectionCard title="Production run">
          <FieldGrid columns={2}>
            <Field label="Event time" required>
              <DateTimeInput />
            </Field>
            <Field label="Finished good" required>
              <select className="input">
                <option value="">— select —</option>
                <option>Mojito cocktail 450ml</option>
                <option>Margarita cocktail 450ml</option>
                <option>Peach iced tea 1L</option>
              </select>
            </Field>
            <Field label="Produced quantity" required>
              <QuantityInput unit="bottle" />
            </Field>
            <Field label="Scrap quantity">
              <QuantityInput unit="bottle" />
            </Field>
            <Field label="Shift">
              <select className="input">
                <option value="">—</option>
                <option>morning</option>
                <option>afternoon</option>
                <option>night</option>
              </select>
            </Field>
            <Field label="Operator name">
              <input className="input" />
            </Field>
            <Field label="Notes" span={2}>
              <NotesBox placeholder="Optional notes." />
            </Field>
          </FieldGrid>
        </SectionCard>

        <FormActionsBar
          hint="Submit is not wired in v1.1. Window 1 owns the production-posting envelope."
          primary={
            <button className="btn btn-primary" type="button" disabled>
              Submit (disabled)
            </button>
          }
        />
      </form>
    </>
  );
}
