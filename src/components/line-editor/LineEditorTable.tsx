"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface LineEditorColumn<T> {
  key: string;
  header: ReactNode;
  width?: string;
  render: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
}

interface LineEditorTableProps<T> {
  rows: T[];
  columns: LineEditorColumn<T>[];
  onAddRow?: () => void;
  onRemoveRow?: (index: number) => void;
  addLabel?: string;
  emptyHint?: string;
  keyFor?: (row: T, index: number) => string;
}

export function LineEditorTable<T>({
  rows,
  columns,
  onAddRow,
  onRemoveRow,
  addLabel = "Add line",
  emptyHint = "No lines yet. Add one to begin.",
  keyFor,
}: LineEditorTableProps<T>) {
  return (
    <div className="overflow-hidden rounded border border-border/70 bg-bg-raised">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th className="w-12 px-3 py-2 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              #
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center"
                )}
              >
                {c.header}
              </th>
            ))}
            {onRemoveRow ? <th className="w-10" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + 2}
                className="px-3 py-8 text-center text-xs text-fg-subtle"
              >
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={keyFor ? keyFor(row, index) : index}
                className="border-b border-border/40 last:border-b-0 transition-colors duration-150 hover:bg-bg-subtle/40"
              >
                <td className="px-3 py-2 text-center font-mono text-3xs tabular-nums text-fg-faint">
                  {String(index + 1).padStart(2, "0")}
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-1.5 align-middle",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center"
                    )}
                  >
                    {c.render(row, index)}
                  </td>
                ))}
                {onRemoveRow ? (
                  <td className="px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(index)}
                      className="flex h-7 w-7 items-center justify-center rounded text-fg-faint transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
                      aria-label={`Remove line ${index + 1}`}
                      title="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {onAddRow ? (
        <div className="flex items-center justify-between border-t border-border/70 bg-bg-subtle/40 px-3 py-2">
          <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            {rows.length} line{rows.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onAddRow}
            className="btn btn-ghost btn-sm gap-1.5"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            {addLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
