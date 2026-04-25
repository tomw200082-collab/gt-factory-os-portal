// Clone-or-resume mutation hook for the [Edit recipe →] entry.
// Decision tree:
//   - If existingDraftId is set, return it (no API call) — the editor opens
//     the existing DRAFT.
//   - Else if activeVersionId is set, POST a new DRAFT cloned from active.
//   - Else POST an empty DRAFT.

import { useMutation } from "@tanstack/react-query";

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
  const m = useMutation({
    mutationFn: async (input: EnterEditInput): Promise<string> => {
      if (input.existingDraftId) return input.existingDraftId;
      const body: Record<string, string> = {
        head_id: input.bomHeadId,
        idempotency_key: randomIdempotencyKey(),
      };
      if (input.activeVersionId) body.clone_from_version_id = input.activeVersionId;
      const res = await fetch("/api/boms/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createDraft: ${res.status}`);
      const json = await res.json();
      return json.bom_version_id as string;
    },
  });
  return { enterEdit: m.mutateAsync, isPending: m.isPending };
}
