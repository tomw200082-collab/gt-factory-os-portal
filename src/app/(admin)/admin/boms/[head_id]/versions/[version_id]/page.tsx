"use client";

// ---------------------------------------------------------------------------
// Admin · BOM editor (hero surface) — AMMC v1 Slice 6 UI.
//
// /admin/boms/[head_id]/versions/[version_id]
//
// Mode determination:
//   - If version.status === 'draft' (case-insensitive): edit mode — line
//     add / replace / quantity_per edit / delete + Publish flow.
//   - Otherwise (active / archived / superseded): read-only view with a
//     banner pointing at the head page to create a new draft.
//
// Header:
//   <WorkflowHeader> title "BOM v<label>" eyebrow "item + head + version_id"
//   status badge (draft / active / superseded)
//   <ReadinessCard> consuming /api/boms/versions/[id]/readiness
//
// Lines table:
//   columns: #, component, quantity_per, unit, component readiness pill, actions
//   Component column: read-only text + "Replace" button (edit mode) → opens
//     <EntityPickerPlus> in a <Drawer>. Picker's `onCreateNew` opens
//     <QuickCreateComponent> as a SECOND drawer on top of the picker drawer.
//     Save cascade: create component → returns component_id → picker
//     auto-selects → Confirm → closes both drawers → PATCH the line's
//     final_component_id with if_match_updated_at.
//   quantity_per column: <InlineEditCell type="number"> — PATCH on Enter.
//   Delete action: per-row delete → confirm → DELETE endpoint.
//   + Add line: bottom button → picker drawer (same stack) → POST new line
//     with default final_component_qty=1 (A13: sensible default, admin
//     edits immediately after).
//
// Publish section (edit mode only):
//   Pre-loads /publish-preview to decide button enable state.
//   - If can_publish_clean: confirm dialog "Publish v<n>? This will
//     supersede v<current_active>" → POST publish with no override.
//   - If !can_publish_clean && can_publish_with_override: warnings list
//     + "I understand — proceed anyway" checkbox → POST publish with
//     confirm_override=true.
//   - If !can_publish_with_override: disabled + surface blockers
//     (empty / running planning runs with run_ids).
//   On success: refetch version + invalidate all bom queries + success
//   toast.
//
// Read-only view (non-draft versions):
//   Same layout minus edit controls + top banner "This version is
//   {active|superseded} — read-only. To edit, create a new draft from
//   <link to head page>".
// ---------------------------------------------------------------------------

import { useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Replace,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { Drawer } from "@/components/overlays/Drawer";
import { EntityPickerPlus } from "@/components/fields/EntityPickerPlus";
import type { EntityOption } from "@/components/fields/EntitySearchSelect";
import { QuickCreateComponent } from "@/components/admin/quick-create/QuickCreateComponent";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { ReadinessCard } from "@/components/readiness/ReadinessCard";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import {
  AdminMutationError,
  patchEntity,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { BomSimulator } from "@/components/bom/BomSimulator";
import { BomNetRequirements } from "@/components/bom/BomNetRequirements";

// --- Types ----------------------------------------------------------------

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  parent_ref_id: string;
  parent_name: string | null;
  active_version_id: string | null;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
  status: string;
}

interface BomVersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  updated_at: string;
}

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
  line_no: number;
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
  component_uom: string | null;
  qty_per_l_output: string | null;
  updated_at: string;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  inventory_uom: string | null;
  status: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
}

interface ReadinessPayload {
  is_ready?: boolean;
  readiness_summary?: string;
  blockers?: Array<{ code: string; label?: string; detail?: string }>;
}

interface PublishPreview {
  version_id: string;
  version_status: string;
  is_empty?: boolean;
  line_count?: number;
  running_planning_runs?: Array<{
    planning_run_id: string;
    started_at?: string;
    triggered_by_display_name?: string;
  }>;
  unposted_production_actuals?: Array<{
    submission_id: string;
    bom_version_id_pinned?: string;
  }>;
  blocking_issues?: string[];
  warnings?: string[];
  can_publish_clean?: boolean;
  can_publish_with_override?: boolean;
}

type ListEnvelope<T> = { rows: T[]; count: number };

// --- Helpers --------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminMutationError(
      res.status,
      (json as { message?: string })?.message ?? "Could not save. Check your connection and try again.",
      (json as { code?: string })?.code,
      json,
    );
  }
  return json as T;
}

async function deleteJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminMutationError(
      res.status,
      (json as { message?: string })?.message ?? "Could not save. Check your connection and try again.",
      (json as { code?: string })?.code,
      json,
    );
  }
  return json as T;
}

// --- Page -----------------------------------------------------------------

interface PageProps {
  params: Promise<{ head_id: string; version_id: string }>;
}

export default function AdminBomEditorPage({ params }: PageProps): JSX.Element {
  const { head_id, version_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const router = useRouter();

  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  // --- Data ---------------------------------------------------------------

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });
  const head = useMemo(
    () =>
      (headsQuery.data?.rows ?? []).find((h) => h.bom_head_id === head_id) ??
      null,
    [headsQuery.data, head_id],
  );

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-bom-editor"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    enabled: !!head,
  });
  const item = useMemo(() => {
    if (!head) return null;
    return (
      (itemsQuery.data?.rows ?? []).find(
        (i) => i.item_id === head.parent_ref_id,
      ) ?? null
    );
  }, [itemsQuery.data, head]);

  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "bom_version", "by-head", head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(head_id)}&limit=1000`,
      ),
    enabled: !!head,
  });
  const version = useMemo(
    () =>
      (versionsQuery.data?.rows ?? []).find(
        (v) => v.bom_version_id === version_id,
      ) ?? null,
    [versionsQuery.data, version_id],
  );

  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", version_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(version_id)}&limit=1000`,
      ),
    enabled: !!version,
  });

  const readinessQuery = useQuery<ReadinessPayload>({
    queryKey: ["admin", "bom_version", version_id, "readiness"],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions/${encodeURIComponent(version_id)}/readiness`,
      ),
    enabled: !!version,
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all-for-bom-picker"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const componentsById = useMemo(() => {
    const map = new Map<string, ComponentRow>();
    for (const c of componentsQuery.data?.rows ?? []) {
      map.set(c.component_id, c);
    }
    return map;
  }, [componentsQuery.data]);

  const componentOptions: EntityOption[] = useMemo(() => {
    return (componentsQuery.data?.rows ?? [])
      .filter((c) => c.status === "ACTIVE")
      .map((c) => ({
        id: c.component_id,
        label: c.component_name,
        sublabel: c.component_id,
        hint: c.inventory_uom ?? undefined,
      }));
  }, [componentsQuery.data]);

  // Derived state
  const statusLower = (version?.status ?? "").toLowerCase();
  const isDraft = statusLower === "draft";
  const editMode = isDraft && isAdmin;
  const activeVersionId = head?.active_version_id ?? null;

  const lines = useMemo(() => {
    return (linesQuery.data?.rows ?? [])
      .slice()
      .sort((a, b) => a.line_no - b.line_no);
  }, [linesQuery.data]);

  // --- Drawer stack state -------------------------------------------------

  // Which surface the line picker is acting on:
  //   - { kind: 'replace', line_id } → PATCH final_component_id on that line
  //   - { kind: 'add' }               → POST a new line at bottom
  //   - null                          → closed
  const [pickerTarget, setPickerTarget] = useState<
    | { kind: "replace"; line_id: string; current_component_id: string; ifMatch: string }
    | { kind: "add" }
    | null
  >(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [pickerDraftSelection, setPickerDraftSelection] = useState<
    string | null
  >(null);
  const [pickerSaving, setPickerSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    line_id: string;
    label: string;
    ifMatch: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Publish flow state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishOverrideChecked, setPublishOverrideChecked] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Shared qty: syncs simulator → net-requirements so operator types qty once
  const [simulatedQty, setSimulatedQty] = useState<string | undefined>(undefined);

  // --- Mutations ----------------------------------------------------------

  const patchLineQty = useMutation({
    mutationFn: async (args: {
      line_id: string;
      qty: string | number;
      ifMatch: string;
    }) =>
      patchEntity({
        url: `/api/boms/versions/${encodeURIComponent(version_id)}/lines/${encodeURIComponent(args.line_id)}`,
        fields: { final_component_qty: String(args.qty) },
        ifMatchUpdatedAt: args.ifMatch,
      }),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Quantity updated." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_lines", "by-version", version_id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version", version_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Quantity update failed: ${msg}` });
    },
  });

  const patchLineComponent = useMutation({
    mutationFn: async (args: {
      line_id: string;
      new_component_id: string;
      ifMatch: string;
    }) =>
      patchEntity({
        url: `/api/boms/versions/${encodeURIComponent(version_id)}/lines/${encodeURIComponent(args.line_id)}`,
        fields: { final_component_id: args.new_component_id },
        ifMatchUpdatedAt: args.ifMatch,
      }),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Component replaced." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_lines", "by-version", version_id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version", version_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Replace failed: ${msg}` });
    },
  });

  const addLine = useMutation({
    mutationFn: async (args: { component_id: string }) =>
      postJson<{ line_id: string }>(
        `/api/boms/versions/${encodeURIComponent(version_id)}/lines`,
        {
          final_component_id: args.component_id,
          final_component_qty: "1",
          idempotency_key: randomIdempotencyKey(),
        },
      ),
    onSuccess: () => {
      setBanner({
        kind: "success",
        message: "Line added. Adjust quantity inline.",
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_lines", "by-version", version_id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version", version_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Add line failed: ${msg}` });
    },
  });

  const deleteLine = useMutation({
    mutationFn: async (args: { line_id: string }) =>
      deleteJson(
        `/api/boms/versions/${encodeURIComponent(version_id)}/lines/${encodeURIComponent(args.line_id)}`,
        { idempotency_key: randomIdempotencyKey() },
      ),
    onSuccess: () => {
      setBanner({ kind: "success", message: "Line removed." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_lines", "by-version", version_id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version", version_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Delete failed: ${msg}` });
    },
  });

  // --- One-click draft-from-this-version shortcut (2026-04-21 readiness-ux) ---
  // On an active version, skip the head-page detour: POST /api/boms/versions
  // with this version as clone_from, then navigate directly to the new draft
  // editor. Mirrors the head-page "New draft" mutation exactly (same endpoint,
  // same idempotency_key, same navigation target).
  const newDraftFromThisMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/boms/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          head_id,
          clone_from_version_id: version_id,
          idempotency_key: randomIdempotencyKey(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new AdminMutationError(
          res.status,
          (json as { message?: string })?.message ?? "Could not save. Check your connection and try again.",
          (json as { code?: string })?.code,
          json,
        );
      }
      return json as { bom_version_id: string };
    },
    onSuccess: (data) => {
      if (data?.bom_version_id) {
        router.push(
          `/admin/boms/${encodeURIComponent(head_id)}/versions/${encodeURIComponent(data.bom_version_id)}`,
        );
      }
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `New draft failed: ${msg}` });
    },
  });

  // --- Publish preview (only fetch when we have a draft version) ---------
  const previewQuery = useQuery<PublishPreview>({
    queryKey: ["admin", "bom_version", version_id, "publish-preview"],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions/${encodeURIComponent(version_id)}/publish-preview`,
      ),
    enabled: !!version && isDraft,
    // Stale time short — blockers can appear / clear as planning_runs start /
    // complete; we want the dialog to reflect the latest snapshot.
    staleTime: 5000,
  });
  const preview = previewQuery.data ?? null;

  const publish = useMutation({
    mutationFn: async (args: { confirmOverride: boolean }) => {
      if (!version) throw new Error("No version loaded.");
      setPublishing(true);
      return postJson(
        `/api/boms/versions/${encodeURIComponent(version_id)}/publish`,
        {
          if_match_updated_at: version.updated_at,
          idempotency_key: randomIdempotencyKey(),
          confirm_override: args.confirmOverride || undefined,
        },
      );
    },
    onSuccess: () => {
      setBanner({
        kind: "success",
        message: `Published v${version?.version_label ?? ""}. This version is now active.`,
      });
      setPublishDialogOpen(false);
      setPublishOverrideChecked(false);
      // Broad invalidation — many surfaces depend on active_version_id.
      void queryClient.invalidateQueries({ queryKey: ["admin", "bom_head"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_lines"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Publish failed: ${msg}` });
    },
    onSettled: () => {
      setPublishing(false);
    },
  });

  // --- Drawer + picker handlers ------------------------------------------

  function openReplacePicker(line: BomLineRow) {
    setPickerTarget({
      kind: "replace",
      line_id: line.line_id,
      current_component_id: line.final_component_id,
      ifMatch: line.updated_at,
    });
    setPickerDraftSelection(line.final_component_id);
  }

  function openAddPicker() {
    setPickerTarget({ kind: "add" });
    setPickerDraftSelection(null);
  }

  function closeAllPickerDrawers() {
    setPickerTarget(null);
    setPickerDraftSelection(null);
    setQuickCreateOpen(false);
  }

  async function confirmPickerSelection() {
    if (!pickerTarget || !pickerDraftSelection) return;
    setPickerSaving(true);
    try {
      if (pickerTarget.kind === "replace") {
        if (pickerDraftSelection === pickerTarget.current_component_id) {
          // No-op — close.
          closeAllPickerDrawers();
          return;
        }
        await patchLineComponent.mutateAsync({
          line_id: pickerTarget.line_id,
          new_component_id: pickerDraftSelection,
          ifMatch: pickerTarget.ifMatch,
        });
      } else {
        // add
        await addLine.mutateAsync({ component_id: pickerDraftSelection });
      }
      closeAllPickerDrawers();
    } catch {
      // Error already surfaced via mutation onError → banner.
    } finally {
      setPickerSaving(false);
    }
  }

  // --- Render guards ------------------------------------------------------

  if (headsQuery.isLoading || versionsQuery.isLoading) {
    return <div className="p-5 text-sm text-fg-muted">Loading BOM editor…</div>;
  }
  if (headsQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        {(headsQuery.error as Error).message}
      </div>
    );
  }
  if (!head) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        BOM head not found: {head_id}
      </div>
    );
  }
  if (!version) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        BOM version not found on this head: {version_id}
      </div>
    );
  }

  const isActive = head.active_version_id === version.bom_version_id;
  const statusTone =
    statusLower === "active" || isActive
      ? "success"
      : isDraft
        ? "warning"
        : "neutral";
  const statusLabel =
    isActive || statusLower === "active"
      ? "active"
      : isDraft
        ? "draft"
        : statusLower === "archived" || statusLower === "superseded"
          ? "superseded"
          : version.status;

  // --- Render ------------------------------------------------------------

  return (
    <>
      <div className="mb-2">
        <Link
          href={`/admin/boms/${encodeURIComponent(head_id)}`}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          {item?.item_name ?? head.parent_name ?? head.parent_ref_id} · versions
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={`Admin · BOM · ${item?.item_id ?? head.parent_name ?? head.parent_ref_id} · ${head.bom_head_id}`}
        title={`BOM v${version.version_label}`}
        description={
          isDraft
            ? "Draft version — edit lines freely. Publishing will supersede the current active version."
            : isActive
              ? "This is the active version of the BOM. Read-only here; create a new draft on the head page to edit."
              : "Superseded version — read-only history record."
        }
        meta={
          <>
            <Badge tone={statusTone} dotted>
              {statusLabel}
            </Badge>
            <Badge tone="neutral" dotted>
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </Badge>
            {item ? (
              <Badge tone="info" dotted>
                {item.supply_method}
              </Badge>
            ) : null}
            <ReadinessPill readiness={readinessQuery.data ?? null} />
          </>
        }
        actions={
          editMode ? (
            <PublishButton
              preview={preview}
              loadingPreview={previewQuery.isLoading}
              onOpen={() => {
                setPublishOverrideChecked(false);
                setPublishDialogOpen(true);
              }}
            />
          ) : isActive && isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => {
                setBanner(null);
                newDraftFromThisMutation.mutate();
              }}
              disabled={newDraftFromThisMutation.isPending}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              {newDraftFromThisMutation.isPending
                ? "Creating…"
                : "Create draft from this version"}
            </button>
          ) : null
        }
      />

      {!isDraft ? (
        <div className="rounded-md border border-info/40 bg-info-softer p-3 text-sm text-info-fg">
          This version is {isActive ? "active" : "superseded"} — read-only. To
          edit, create a new draft from the{" "}
          <Link
            href={`/admin/boms/${encodeURIComponent(head_id)}`}
            className="font-semibold underline decoration-info/60 underline-offset-2"
          >
            version history page
          </Link>
          .
        </div>
      ) : null}

      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          {banner.message}
        </div>
      ) : null}

      {/* Readiness card */}
      {readinessQuery.data ? (
        <ReadinessCard
          entity="bom_version"
          readiness={{
            is_ready: readinessQuery.data.is_ready ?? false,
            readiness_summary: readinessQuery.data.readiness_summary,
            blockers: (readinessQuery.data.blockers ?? []).map((b) => ({
              code: b.code,
              label: b.label ?? b.code,
              detail: b.detail,
            })),
          }}
        />
      ) : null}

      {/* Base output context — makes every line's "qty per" denominator explicit */}
      <SectionCard
        eyebrow="BOM basis"
        title="Output quantity"
        contentClassName="px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Base output
            </span>
            <span className="font-mono font-semibold tabular-nums text-fg">
              {head.final_bom_output_qty}{" "}
              <span className="text-fg-muted">{head.final_bom_output_uom ?? "units"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              All line quantities below are
            </span>
            <span className="rounded bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
              per {head.final_bom_output_qty} {head.final_bom_output_uom ?? "units"} of output
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Unit rate
            </span>
            <span className="rounded bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
              qty per 1 {head.final_bom_output_uom ?? "unit"} of output
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Lines table */}
      <SectionCard
        eyebrow="Lines"
        title={`${lines.length} component${lines.length === 1 ? "" : "s"}`}
        actions={
          editMode ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
              onClick={openAddPicker}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add line
            </button>
          ) : null
        }
        contentClassName="p-0"
      >
        {linesQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading lines…</div>
        ) : lines.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No lines on this version.{" "}
            {editMode ? 'Click "Add line" to start building the BOM.' : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>#</Th>
                  <Th>Component</Th>
                  <Th align="right">
                    Qty per {head.final_bom_output_qty}{" "}
                    {head.final_bom_output_uom ?? "units"}
                  </Th>
                  <Th align="right">Rate per unit</Th>
                  <Th>Unit</Th>
                  <Th>Readiness</Th>
                  {editMode ? <Th align="right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <BomLineEditorRow
                    key={l.line_id}
                    line={l}
                    component={componentsById.get(l.final_component_id) ?? null}
                    editMode={editMode}
                    onReplace={() => openReplacePicker(l)}
                    onQuantitySave={async (v) => {
                      await patchLineQty.mutateAsync({
                        line_id: l.line_id,
                        qty: v,
                        ifMatch: l.updated_at,
                      });
                    }}
                    onDelete={() =>
                      setDeleteConfirm({
                        line_id: l.line_id,
                        label: l.final_component_name || l.final_component_id,
                        ifMatch: l.updated_at,
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Simulator — below lines, always visible if active version */}
      <BomSimulator
        headId={head.bom_head_id}
        baseOutputQty={head.final_bom_output_qty}
        outputUom={head.final_bom_output_uom}
        hasActiveVersion={!!head.active_version_id}
        onSimulated={setSimulatedQty}
      />

      {/* Net requirements / purchase assistant */}
      <BomNetRequirements
        headId={head.bom_head_id}
        baseOutputQty={head.final_bom_output_qty}
        outputUom={head.final_bom_output_uom}
        hasActiveVersion={!!head.active_version_id}
        suggestedQty={simulatedQty}
      />

      {/* --- Drawer stack: picker + QuickCreateComponent --------------- */}
      {pickerTarget ? (
        <Drawer
          open={true}
          onClose={() => {
            if (pickerSaving) return;
            closeAllPickerDrawers();
          }}
          title={
            pickerTarget.kind === "replace" ? "Replace component" : "Add line"
          }
          description={
            pickerTarget.kind === "replace"
              ? "Pick a different component for this line, or create a new one inline."
              : "Pick a component for the new line, or create a new one inline."
          }
          width="lg"
        >
          <div className="space-y-4">
            <EntityPickerPlus
              value={pickerDraftSelection ?? undefined}
              onChange={(opt) => setPickerDraftSelection(opt?.id ?? null)}
              options={componentOptions}
              placeholder="Search components…"
              entityName="component"
              emptyLabel={
                componentsQuery.isLoading
                  ? "Loading components…"
                  : "No matching components"
              }
              onCreateNew={() => setQuickCreateOpen(true)}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pickerSaving}
                onClick={closeAllPickerDrawers}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!pickerDraftSelection || pickerSaving}
                onClick={() => {
                  void confirmPickerSelection();
                }}
              >
                {pickerSaving
                  ? "Saving…"
                  : pickerTarget.kind === "replace"
                    ? "Confirm replace"
                    : "Add line"}
              </button>
            </div>
          </div>
        </Drawer>
      ) : null}

      <QuickCreateComponent
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(newComponentId) => {
          // Auto-select the newly-created component in the outer picker.
          setPickerDraftSelection(newComponentId);
          // Invalidate the components list so the new row shows up in search.
          void queryClient.invalidateQueries({
            queryKey: ["admin", "components", "all-for-bom-picker"],
          });
        }}
      />

      {/* --- Delete confirm --- */}
      {deleteConfirm ? (
        <Drawer
          open={true}
          onClose={() => {
            if (!deleting) setDeleteConfirm(null);
          }}
          title="Remove line"
          description="This removes the line from the DRAFT version. The change is captured in the audit log."
          width="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-fg">
              Remove <span className="font-semibold">{deleteConfirm.label}</span>{" "}
              from this draft version?
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={deleting}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary bg-danger text-danger-fg hover:bg-danger/90"
                disabled={deleting}
                onClick={async () => {
                  if (!deleteConfirm) return;
                  setDeleting(true);
                  try {
                    await deleteLine.mutateAsync({
                      line_id: deleteConfirm.line_id,
                    });
                    setDeleteConfirm(null);
                  } catch {
                    /* banner surfaced via onError */
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Removing…" : "Remove line"}
              </button>
            </div>
          </div>
        </Drawer>
      ) : null}

      {/* --- Publish confirm dialog --- */}
      {publishDialogOpen && preview ? (
        <Drawer
          open={true}
          onClose={() => {
            if (!publishing) setPublishDialogOpen(false);
          }}
          title={`Publish v${version.version_label}?`}
          description={
            preview.can_publish_clean
              ? `This will supersede v${
                  activeVersionId &&
                  (versionsQuery.data?.rows ?? []).find(
                    (v) => v.bom_version_id === activeVersionId,
                  )?.version_label
                    ? (versionsQuery.data?.rows ?? []).find(
                        (v) => v.bom_version_id === activeVersionId,
                      )!.version_label
                    : "the current active version"
                } and activate this version immediately.`
              : "Review the preflight checks below before publishing."
          }
          width="lg"
        >
          <div className="space-y-4">
            {preview.can_publish_clean ? (
              <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                <div>
                  All preflight checks pass. You are about to promote this
                  draft to active.
                </div>
              </div>
            ) : null}

            {(preview.blocking_issues ?? []).length > 0 ? (
              <div className="rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                  Blocking issues
                </div>
                <ul className="list-disc pl-5 text-xs">
                  {(preview.blocking_issues ?? []).map((code) => (
                    <li key={code} className="text-fg-muted">
                      {code === "EMPTY_VERSION"
                        ? "Add at least one line before publishing."
                        : code === "PLANNING_RUN_IN_FLIGHT"
                          ? "A planning run referencing this BOM is currently running. Wait for it to complete."
                          : code === "VERSION_NOT_DRAFT"
                            ? "This version is no longer a draft — refresh the page."
                            : code}
                    </li>
                  ))}
                </ul>
                {(preview.running_planning_runs ?? []).length > 0 ? (
                  <div className="mt-2">
                    <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Running planning runs
                    </div>
                    <ul className="mt-1 list-disc pl-5 font-mono text-xs text-fg-muted">
                      {(preview.running_planning_runs ?? []).map((r) => (
                        <li key={r.planning_run_id}>
                          {r.planning_run_id}
                          {r.started_at ? (
                            <span className="text-3xs text-fg-subtle">
                              {" "}
                              · started{" "}
                              {new Date(r.started_at).toLocaleString()}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(preview.warnings ?? []).length > 0 &&
            !preview.can_publish_clean &&
            preview.can_publish_with_override ? (
              <div className="rounded-md border border-warning/40 bg-warning-softer p-3 text-sm text-warning-fg">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                  Warnings
                </div>
                <ul className="list-disc pl-5 text-xs text-fg-muted">
                  {(preview.warnings ?? []).map((w) => (
                    <li key={w}>
                      {w === "UNPOSTED_PRODUCTION_ACTUALS"
                        ? `There ${(preview.unposted_production_actuals ?? []).length === 1 ? "is" : "are"} ${(preview.unposted_production_actuals ?? []).length} unposted production ${(preview.unposted_production_actuals ?? []).length === 1 ? "entry" : "entries"} pinned to the current active version. Publishing will not affect them, but confirm this is intentional.`
                        : w}
                    </li>
                  ))}
                </ul>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={publishOverrideChecked}
                    onChange={(e) =>
                      setPublishOverrideChecked(e.target.checked)
                    }
                  />
                  <span>
                    I understand — proceed anyway. The warnings above will be
                    acknowledged in the publish audit entry.
                  </span>
                </label>
              </div>
            ) : null}

            {!preview.can_publish_with_override ? (
              <div className="rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
                Cannot publish — resolve the blocking issues above, then
                refresh the page.
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-border/70 pt-4">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={publishing}
                onClick={() => setPublishDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  publishing ||
                  !preview.can_publish_with_override ||
                  (!preview.can_publish_clean && !publishOverrideChecked)
                }
                onClick={() => {
                  publish.mutate({
                    confirmOverride: !preview.can_publish_clean,
                  });
                }}
              >
                {publishing
                  ? "Publishing…"
                  : preview.can_publish_clean
                    ? "Confirm & publish"
                    : "Confirm override & publish"}
              </button>
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

// --- Subcomponents --------------------------------------------------------

function PublishButton({
  preview,
  loadingPreview,
  onOpen,
}: {
  preview: PublishPreview | null;
  loadingPreview: boolean;
  onOpen: () => void;
}): JSX.Element {
  if (loadingPreview || !preview) {
    return (
      <button type="button" className="btn-primary" disabled>
        Publish
      </button>
    );
  }
  const canProceed = !!preview.can_publish_with_override;
  return (
    <button
      type="button"
      className="btn-primary"
      disabled={!canProceed}
      title={
        canProceed
          ? preview.can_publish_clean
            ? "All preflight checks pass."
            : "Warnings present — override required."
          : "Blocked — resolve blocking issues first."
      }
      onClick={onOpen}
    >
      Publish
    </button>
  );
}

function formatRate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const n = parseFloat(raw);
  if (isNaN(n)) return "—";
  // show up to 6 significant digits, strip trailing zeros
  return n.toPrecision(6).replace(/\.?0+$/, "");
}

function BomLineEditorRow({
  line,
  component,
  editMode,
  onReplace,
  onQuantitySave,
  onDelete,
}: {
  line: BomLineRow;
  component: ComponentRow | null;
  editMode: boolean;
  onReplace: () => void;
  onQuantitySave: (newValue: string | number) => Promise<void>;
  onDelete: () => void;
}): JSX.Element {
  const componentName = line.final_component_name || component?.component_name || "—";
  const unit = line.component_uom ?? component?.inventory_uom ?? "—";

  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
      <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
        {line.line_no}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-fg">{componentName}</div>
            <div className="text-3xs font-mono text-fg-subtle">
              {line.final_component_id}
            </div>
          </div>
          {editMode ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm inline-flex shrink-0 items-center gap-1"
              onClick={onReplace}
              aria-label={`Replace component on line ${line.line_no}`}
            >
              <Replace className="h-3 w-3" strokeWidth={2} />
              Replace
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
        {editMode ? (
          <InlineEditCell
            value={line.final_component_qty}
            type="number"
            inputMode="decimal"
            ifMatchUpdatedAt={line.updated_at}
            onSave={async (v) => {
              await onQuantitySave(v);
            }}
          />
        ) : (
          line.final_component_qty
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-subtle"
          title={line.qty_per_l_output ? `${line.qty_per_l_output} per 1 unit of output` : "Rate not yet computed"}>
        {formatRate(line.qty_per_l_output)}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">{unit}</td>
      <td className="px-3 py-2">
        <LineReadinessCell component_id={line.final_component_id} />
      </td>
      {editMode ? (
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            className="btn btn-ghost btn-sm inline-flex items-center gap-1 text-danger-fg hover:bg-danger-softer"
            onClick={onDelete}
            aria-label={`Delete line ${line.line_no}`}
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
            Delete
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function LineReadinessCell({
  component_id,
}: {
  component_id: string;
}): JSX.Element {
  const q = useQuery<ReadinessPayload>({
    queryKey: ["admin", "components", component_id, "readiness"],
    queryFn: () =>
      fetchJson(
        `/api/components/${encodeURIComponent(component_id)}/readiness`,
      ),
  });
  if (q.isLoading) {
    return <span className="text-3xs text-fg-subtle">…</span>;
  }
  if (q.isError || !q.data) {
    return <ReadinessPill readiness={null} />;
  }
  return <ReadinessPill readiness={q.data} />;
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
