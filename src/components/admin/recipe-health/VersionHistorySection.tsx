// VersionHistorySection — collapsible per-product BOM version list. Two
// columns (Base / Pack) when both heads exist. Shows status, published_at,
// published_by_display_name, lines_count. Admin gets [Resume editing →]
// for DRAFT entries.

"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface VersionRow {
  bom_version_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  published_at: string | null;
  published_by_display_name: string | null;
  lines_count: number;
}

function useHeadVersions(headId: string | null) {
  return useQuery({
    queryKey: ["boms", "versions", "history", headId],
    queryFn: async () => {
      const res = await fetch(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(headId!)}`,
      );
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      const body = await res.json();
      return (body.rows ?? []) as VersionRow[];
    },
    enabled: headId !== null,
  });
}

interface VersionHistorySectionProps {
  baseBomHeadId: string | null;
  packBomHeadId: string | null;
  isAdmin: boolean;
}

export function VersionHistorySection({
  baseBomHeadId,
  packBomHeadId,
  isAdmin,
}: VersionHistorySectionProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const baseQ = useHeadVersions(open ? baseBomHeadId : null);
  const packQ = useHeadVersions(open ? packBomHeadId : null);

  return (
    <section className="my-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-blue-700 underline"
      >
        {open ? "▼" : "▶"} היסטוריית גרסאות
      </button>
      {open && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Base", headId: baseBomHeadId, q: baseQ },
            { label: "Pack", headId: packBomHeadId, q: packQ },
          ].map(({ label, headId, q }) => (
            <div key={label}>
              <div className="font-semibold">{label}</div>
              {(q.data ?? []).map((v) => (
                <div
                  key={v.bom_version_id}
                  className="border-b py-1 text-sm"
                >
                  <span>{v.version_label}</span>
                  <span className="ml-2 rounded bg-gray-100 px-1 text-xs">
                    {v.status}
                  </span>
                  <span className="ml-2 text-gray-600">
                    {v.published_at ?? "—"} ·{" "}
                    {v.published_by_display_name ?? "—"} · {v.lines_count} lines
                  </span>
                  {v.status === "DRAFT" && isAdmin && headId && (
                    <Link
                      className="ml-2 text-blue-700 underline"
                      href={`/admin/masters/boms/${headId}/${v.bom_version_id}/edit`}
                    >
                      Resume editing →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
