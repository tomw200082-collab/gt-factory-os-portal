// Clone-or-resume mutation hook for the [Edit recipe →] entry.
// Decision tree:
//   - If existingDraftId is set, return it (no API call) — the editor opens
//     the existing DRAFT.
//   - Else if activeVersionId is set, POST a new DRAFT cloned from active.
//   - Else POST an empty DRAFT.
//
// On success, the hook invalidates the versions list cache for this head
// so the editor page (which finds the new DRAFT in that list) doesn't
// race against stale cache and stick on a "version not found" loader.

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface EnterEditInput {
  bomHeadId: string;
  activeVersionId: string | null;
  existingDraftId: string | null;
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function useEnterEditDraft() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (
      input: EnterEditInput,
    ): Promise<{ versionId: string; bomHeadId: string }> => {
      if (input.existingDraftId) {
        return {
          versionId: input.existingDraftId,
          bomHeadId: input.bomHeadId,
        };
      }
      const body: Record<string, string> = {
        head_id: input.bomHeadId,
        idempotency_key: randomIdempotencyKey(),
      };
      if (input.activeVersionId)
        body.clone_from_version_id = input.activeVersionId;
      const res = await fetch("/api/boms/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createDraft: ${res.status}`);
      const json = await res.json();
      const versionId = json?.row?.bom_version_id as string | undefined;
      if (!versionId) {
        throw new Error("createDraft: server returned no version id");
      }
      return { versionId, bomHeadId: input.bomHeadId };
    },
    onSuccess: ({ bomHeadId }) => {
      // The editor will read /api/boms/versions?bom_head_id=<head> and find
      // the new DRAFT by id. Invalidate so it refetches instead of using
      // the cached pre-clone list.
      void qc.invalidateQueries({ queryKey: ["boms", "versions", bomHeadId] });
    },
  });

  // Backwards-compatible enter() that returns just the versionId, since
  // existing call sites only need that.
  async function enterEdit(input: EnterEditInput): Promise<string> {
    const r = await m.mutateAsync(input);
    return r.versionId;
  }

  return { enterEdit, isPending: m.isPending };
}
