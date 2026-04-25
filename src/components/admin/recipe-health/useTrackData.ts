// useTrackData — given a bom_head_id, fetches the head's versions and the
// ACTIVE version's lines (if any). Identifies ACTIVE + DRAFT versions for
// downstream readiness logic.
//
// Field names mirror the upstream Fastify response shape verbatim:
//   bom_lines.final_component_id    — id of the component on this line
//   bom_lines.final_component_name  — denormalized name (display only)
//   bom_lines.final_component_qty   — quantity per batch (string, decimal)
//   bom_lines.component_uom         — UOM string
// Earlier drafts of this hook used `qty`/`component_id`, which silently
// produced `undefined` on every line and made every BOM card render red
// "quantity invalid" against real data. Do not rename without verifying
// the upstream `/api/v1/queries/boms/lines` response shape first.

import { useQuery } from "@tanstack/react-query";

export interface BomLineRow {
  bom_line_id: string;
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
  component_uom: string | null;
  updated_at: string;
}

interface BomVersionRow {
  bom_version_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
}

export interface TrackData {
  activeVersionId: string | null;
  activeVersionLabel: string | null;
  draftVersionId: string | null;
  lines: BomLineRow[];
  isReady: boolean;
  isError: boolean;
  errorMessage: string | null;
}

export function useTrackData(bomHeadId: string | null): TrackData {
  const versionsQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async () => {
      const url = `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId!)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `versions — HTTP ${res.status} from ${url}\n${text.slice(0, 200)}`,
        );
      }
      const body = await res.json();
      return (body.rows ?? []) as BomVersionRow[];
    },
    enabled: bomHeadId !== null,
    staleTime: 30_000,
  });

  const versions = versionsQuery.data ?? [];
  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const draft = versions.find((v) => v.status === "DRAFT") ?? null;

  // Tolerant: a lines failure leaves activeVersionLabel intact and surfaces
  // an error message at the track level. The card still renders the rest
  // of its panel rather than collapsing into a blank loader.
  const linesQuery = useQuery({
    queryKey: ["boms", "lines", active?.bom_version_id ?? null],
    queryFn: async () => {
      const url = `/api/boms/lines?bom_version_id=${encodeURIComponent(active!.bom_version_id)}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `lines — HTTP ${res.status} from ${url}\n${text.slice(0, 200)}`,
        );
      }
      const body = await res.json();
      return (body.rows ?? []) as BomLineRow[];
    },
    enabled: active !== null,
    staleTime: 30_000,
  });

  if (bomHeadId === null) {
    return {
      activeVersionId: null,
      activeVersionLabel: null,
      draftVersionId: null,
      lines: [],
      isReady: true,
      isError: false,
      errorMessage: null,
    };
  }

  const isReady =
    versionsQuery.isSuccess && (active === null || linesQuery.isSuccess);
  const isError = versionsQuery.isError || linesQuery.isError;
  const errorMessage =
    (versionsQuery.error as Error | null)?.message ??
    (linesQuery.error as Error | null)?.message ??
    null;

  return {
    activeVersionId: active?.bom_version_id ?? null,
    activeVersionLabel: active?.version_label ?? null,
    draftVersionId: draft?.bom_version_id ?? null,
    lines:
      active !== null && linesQuery.isSuccess
        ? (linesQuery.data ?? [])
        : [],
    isReady,
    isError,
    errorMessage,
  };
}
