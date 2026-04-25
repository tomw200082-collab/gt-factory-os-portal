// BomDraftEditorPage — page-level component for the DRAFT line editor at
// /admin/masters/boms/[bom_head_id]/[version_id]/edit. Composes:
//   - useQuery for the version row (filtered list + find by id)
//   - useQuery for the head row
//   - useQuery for the version's lines (the table body)
//   - useQuery for the active version's lines (for the Changes-from diff)
//   - useComponentReadinessMap for per-line pips
// Edit affordances are gated on version.status === "DRAFT".

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
import { QuickFixDrawer } from "@/components/admin/recipe-health/QuickFixDrawer";
import { BomLineRow } from "./BomLineRow";
import { BomLineAddDrawer } from "./BomLineAddDrawer";
import { BomLineDiff } from "./BomLineDiff";
import {
  PublishConfirmModal,
  type PublishPreview,
} from "./PublishConfirmModal";

interface BomDraftEditorPageProps {
  bomHeadId: string;
  versionId: string;
  /** Injectable navigator for tests. Defaults to next/navigation router.push. */
  onNavigate?: (href: string) => void;
}

interface VersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  updated_at: string;
}

// Mirrors the upstream `bom_head` row shape from /api/v1/queries/boms/heads.
// The item id is `parent_ref_id` and the item name is `parent_name` — the
// table is parented to whatever owns the BOM (an item for v1; the schema
// keeps it generic). Earlier drafts of this page assumed `item_id` /
// `item_name`, which were never populated, so the post-publish redirect
// silently fell through to the head detail page.
interface HeadRow {
  bom_head_id: string;
  bom_kind: string;
  parent_ref_id: string | null;
  parent_name: string | null;
  active_version_id: string | null;
  status: string;
}

export function BomDraftEditorPage({
  bomHeadId,
  versionId,
  onNavigate,
}: BomDraftEditorPageProps): JSX.Element {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  const versionListQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async (): Promise<VersionRow[]> => {
      const res = await fetch(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId)}`,
      );
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as VersionRow[];
    },
  });
  const versions = versionListQuery.data ?? [];
  const version = versions.find((v) => v.bom_version_id === versionId) ?? null;
  const activeVersion = versions.find((v) => v.status === "ACTIVE") ?? null;

  const headQuery = useQuery({
    queryKey: ["boms", "head", bomHeadId],
    queryFn: async (): Promise<HeadRow | null> => {
      const res = await fetch(
        `/api/boms/heads?bom_head_id=${encodeURIComponent(bomHeadId)}`,
      );
      if (!res.ok) throw new Error(`head: ${res.status}`);
      const body = await res.json();
      const rows = (body.rows ?? []) as HeadRow[];
      return rows.find((h) => h.bom_head_id === bomHeadId) ?? rows[0] ?? null;
    },
  });

  const linesQuery = useQuery({
    queryKey: ["boms", "lines", versionId],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const res = await fetch(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(versionId)}`,
      );
      if (!res.ok) throw new Error(`lines: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomLineDataRow[];
    },
  });

  const activeLinesQuery = useQuery({
    queryKey: ["boms", "lines", activeVersion?.bom_version_id ?? null],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const res = await fetch(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(activeVersion!.bom_version_id)}`,
      );
      if (!res.ok) throw new Error(`active lines: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomLineDataRow[];
    },
    enabled: activeVersion !== null && activeVersion.bom_version_id !== versionId,
  });

  const lines = linesQuery.data;
  const componentIds = useMemo(
    () =>
      Array.from(new Set((lines ?? []).map((l) => l.final_component_id))),
    [lines],
  );
  const readiness = useComponentReadinessMap(componentIds);

  const [addOpen, setAddOpen] = useState(false);
  const [fixComponentId, setFixComponentId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["boms", "publish-preview", versionId],
    queryFn: async (): Promise<PublishPreview> => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/publish-preview`,
      );
      if (!res.ok) throw new Error(`preview: ${res.status}`);
      return (await res.json()) as PublishPreview;
    },
    enabled: previewOpen,
  });

  function publishKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  const publishMutation = useMutation({
    mutationFn: async (args: { confirmOverride: boolean }) => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            if_match_updated_at: version?.updated_at,
            idempotency_key: publishKey(),
            confirm_override: args.confirmOverride,
          }),
        },
      );
      if (!res.ok) throw new Error(`publish: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      const itemId = headQuery.data?.parent_ref_id;
      if (itemId) {
        navigate(`/admin/masters/items/${itemId}`);
      } else {
        navigate(`/admin/masters/boms/${bomHeadId}`);
      }
    },
  });

  // Loading / error / not-found gates — distinct from each other so the
  // page doesn't get stuck on an indistinguishable spinner. A version that
  // resolves to null means "list returned but the id wasn't in it" — this
  // happens routinely when the user just cloned a DRAFT and the navigation
  // raced ahead of the cache invalidation, OR when an old URL lingers.
  // Either way the user needs to know.
  const anyLoading =
    versionListQuery.isLoading || headQuery.isLoading || linesQuery.isLoading;
  if (anyLoading) {
    return <div className="p-6 text-sm text-gray-600">טוען מתכון…</div>;
  }
  const errMsg =
    versionListQuery.error?.message ||
    headQuery.error?.message ||
    linesQuery.error?.message ||
    null;
  if (errMsg) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-900">שגיאת טעינת מתכון</p>
          <p className="mt-1 text-sm text-red-800">{errMsg}</p>
          <button
            type="button"
            onClick={() => {
              void versionListQuery.refetch();
              void headQuery.refetch();
              void linesQuery.refetch();
            }}
            className="mt-3 rounded border px-3 py-1 text-sm"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }
  if (!version) {
    return (
      <div className="p-6">
        <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-semibold">הגרסה לא נמצאה ברשימת הגרסאות.</p>
          <p className="mt-1">
            ייתכן שהטיוטה נוצרה זה עתה — רענן את העמוד. אם המצב נמשך, חזור
            לעמוד המוצר ובחר &quot;Edit recipe&quot; שוב.
          </p>
          <button
            type="button"
            onClick={() => versionListQuery.refetch()}
            className="mt-3 rounded border px-3 py-1"
          >
            רענן
          </button>
        </div>
      </div>
    );
  }
  if (!headQuery.data) {
    return (
      <div className="p-6 text-sm text-gray-700">
        לא נמצא מתכון פעיל לראש BOM זה.
      </div>
    );
  }
  if (!lines) {
    // linesQuery had no error but no data either — treat as transient.
    return <div className="p-6 text-sm text-gray-600">טוען שורות מתכון…</div>;
  }

  const head = headQuery.data;
  const trackLabelEn = head.bom_kind === "BASE" ? "base formula" : "pack BOM";
  const editable = version.status === "DRAFT";
  const itemName = head.parent_name ?? head.parent_ref_id ?? bomHeadId;

  // UI-only warnings (supplier/price gaps) projected from the readiness map.
  // Backend hard-blockers come from the publish-preview response.
  const uiWarnings: string[] = [];
  for (const c of readiness.map.values()) {
    if (c.primary_supplier_id === null)
      uiWarnings.push(`${c.component_name}: ללא ספק ראשי`);
    if (c.active_price_value === null)
      uiWarnings.push(`${c.component_name}: ללא מחיר פעיל`);
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-white p-3">
        <h1 className="text-lg font-semibold">
          Editing {version.version_label} DRAFT for {itemName} — {trackLabelEn}
        </h1>
        <span className="rounded bg-yellow-200 px-2 py-0.5 text-xs">
          {version.status}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="rounded border px-3 py-1">
            Cancel
          </button>
          <button type="button" className="rounded border px-3 py-1">
            Save
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded border bg-blue-600 px-3 py-1 text-white"
          >
            Publish →
          </button>
        </div>
      </header>
      {!editable && (
        <div className="bg-red-100 p-2 text-red-900">
          לא ניתן לערוך גרסה במצב {version.status}
        </div>
      )}
      <main className="p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            {activeVersion && activeVersion.bom_version_id !== versionId && (
              <BomLineDiff
                draftLines={lines}
                activeLines={activeLinesQuery.data ?? []}
                activeVersionLabel={activeVersion.version_label}
              />
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="mb-2 rounded border px-3 py-1"
              >
                + Add component
              </button>
            )}
            {lines.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-gray-500">
                אין שורות. הוסף רכיב ראשון.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">Component</th>
                    <th className="px-2 py-1">Qty</th>
                    <th className="px-2 py-1">UOM</th>
                    <th className="px-2 py-1">Readiness</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <BomLineRow
                      key={line.bom_line_id}
                      line={line}
                      versionId={versionId}
                      readiness={
                        readiness.map.get(line.final_component_id) ?? null
                      }
                      editable={editable}
                      onOpenQuickFix={(cid) => setFixComponentId(cid)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="hidden lg:block">
            <ReadinessPanel
              readinessMap={readiness.map}
              nowMs={Date.now()}
              onFix={setFixComponentId}
            />
          </div>
        </div>
        {/* Mobile-only bottom drawer with the same readiness data. */}
        <div className="lg:hidden">
          <ReadinessPanel
            readinessMap={readiness.map}
            nowMs={Date.now()}
            onFix={setFixComponentId}
            mobileMode
          />
        </div>
        <BomLineAddDrawer
          versionId={versionId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
        />
        {fixComponentId && (
          <QuickFixDrawer
            componentId={fixComponentId}
            open
            onClose={() => setFixComponentId(null)}
          />
        )}
        {previewOpen && previewQuery.data && (
          <PublishConfirmModal
            preview={previewQuery.data}
            uiWarnings={uiWarnings}
            nextVersionLabel={version.version_label}
            onCancel={() => setPreviewOpen(false)}
            onConfirm={(confirmOverride) =>
              publishMutation.mutate({ confirmOverride })
            }
          />
        )}
      </main>
    </div>
  );
}
