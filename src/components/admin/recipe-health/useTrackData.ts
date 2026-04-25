// useTrackData — given a bom_head_id, fetches the head's versions and the
// ACTIVE version's lines (if any). Identifies ACTIVE + DRAFT versions for
// downstream readiness logic.

import { useQuery } from "@tanstack/react-query";

export interface BomLineRow {
  bom_line_id: string;
  component_id: string;
  qty: string;
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
}

export function useTrackData(bomHeadId: string | null): TrackData {
  const versionsQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async () => {
      const res = await fetch(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId!)}`,
      );
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as BomVersionRow[];
    },
    enabled: bomHeadId !== null,
    staleTime: 30_000,
  });

  const versions = versionsQuery.data ?? [];
  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  const draft = versions.find((v) => v.status === "DRAFT") ?? null;

  const linesQuery = useQuery({
    queryKey: ["boms", "lines", active?.bom_version_id ?? null],
    queryFn: async () => {
      const res = await fetch(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(active!.bom_version_id)}`,
      );
      if (!res.ok) throw new Error(`lines: ${res.status}`);
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
    };
  }

  const isReady =
    versionsQuery.isSuccess && (active === null || linesQuery.isSuccess);
  const isError = versionsQuery.isError || linesQuery.isError;

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
  };
}
