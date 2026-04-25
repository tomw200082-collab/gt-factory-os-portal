// Next.js route shell — wires <BomDraftEditorPage>. The corridor's only new
// route. Admin-only is enforced inside the page component (button gating
// + the editor's edit affordances are guarded by version status).
import { BomDraftEditorPage } from "@/components/bom-edit/BomDraftEditorPage";

export default async function Page({
  params,
}: {
  params: Promise<{ bom_head_id: string; version_id: string }>;
}) {
  const p = await params;
  return <BomDraftEditorPage bomHeadId={p.bom_head_id} versionId={p.version_id} />;
}
