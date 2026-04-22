// ---------------------------------------------------------------------------
// /exceptions — legacy route, rehomed in Tranche B of
// portal-full-production-refactor (plan §D). The live triage surface is now
// /inbox; this file redirects to preserve the /exceptions bookmark.
//
// Server-component redirect — renders nothing client-side.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function ExceptionsRedirect(): never {
  redirect("/inbox?view=exceptions");
}
