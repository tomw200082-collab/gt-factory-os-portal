"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, FieldGrid } from "@/components/workflow/FieldGrid";
import { FormActionsBar } from "@/components/workflow/FormActionsBar";
import { DateTimeInput } from "@/components/fields/DateTimeInput";
import { NotesBox } from "@/components/fields/NotesBox";
import { DiffNotice } from "@/components/workflow/DiffNotice";
import { LineEditorTable } from "@/components/line-editor/LineEditorTable";
import { Badge } from "@/components/badges/StatusBadge";

const MOCK_PREFILL_LINES = [
  {
    id: "l1",
    component_name: "Fresh lime juice",
    recommended: "40 L",
    qty: 40,
    unit: "L",
    note: "",
  },
  {
    id: "l2",
    component_name: "Fresh lemon juice",
    recommended: "20 L",
    qty: 20,
    unit: "L",
    note: "",
  },
];

export default function PoFormPage() {
  return (
    <>
      <WorkflowHeader
        eyebrow="Purchasing"
        title="PO creation"
        description="Downstream of approved purchase recommendations. Cannot create POs ad-hoc in v1."
        meta={
          <>
            <Badge tone="neutral">from rec rec_0002</Badge>
            <Badge tone="neutral">Prigat Citrus Cooperative</Badge>
          </>
        }
      />

      <DiffNotice
        tone="info"
        title="Source recommendation version"
        description="This form was opened against planning run 2026-04-14. If a newer run lands, you'll see a stale banner here."
      />

      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <SectionCard title="PO header">
          <FieldGrid columns={2}>
            <Field label="Supplier">
              <input className="input" value="Prigat Citrus Cooperative" readOnly />
            </Field>
            <Field label="Currency">
              <input className="input" value="ILS" readOnly />
            </Field>
            <Field label="Expected receive date" required>
              <DateTimeInput defaultValue={new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16)} />
            </Field>
            <Field label="Payment terms">
              <input className="input" value="net 30" readOnly />
            </Field>
            <Field label="Header notes" span={2}>
              <NotesBox />
            </Field>
          </FieldGrid>
        </SectionCard>

        <SectionCard
          title="Lines"
          description="Prefilled from the approved recommendation. Editing qty requires a per-line reason."
        >
          <LineEditorTable
            rows={MOCK_PREFILL_LINES}
            addLabel="Add line"
            keyFor={(r) => r.id}
            columns={[
              {
                key: "component",
                header: "Component",
                render: (r) => <span className="font-medium">{r.component_name}</span>,
              },
              {
                key: "recommended",
                header: "Recommended",
                align: "right",
                render: (r) => (
                  <span className="font-mono text-2xs text-fg-muted">{r.recommended}</span>
                ),
              },
              {
                key: "qty",
                header: "Order qty",
                align: "right",
                render: (r) => (
                  <input
                    type="number"
                    className="input h-8 text-right font-mono"
                    defaultValue={r.qty}
                  />
                ),
              },
              {
                key: "unit",
                header: "UoM",
                render: (r) => <span className="text-xs">{r.unit}</span>,
              },
              {
                key: "note",
                header: "Reason if changed",
                render: () => <input className="input h-8 text-xs" placeholder="required if qty differs" />,
              },
            ]}
          />
        </SectionCard>

        <FormActionsBar
          hint="Submitting is not wired in this shell. Creating the PO would stage it into OPEN state."
          primary={
            <button className="btn btn-primary" type="button" disabled>
              Create PO (disabled)
            </button>
          }
        />
      </form>
    </>
  );
}
