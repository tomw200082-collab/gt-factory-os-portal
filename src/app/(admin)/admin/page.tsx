// ---------------------------------------------------------------------------
// /admin — no landing surface of its own. Redirect to /admin/items so the
// bare bookmark lands on a real admin surface instead of a 404.
//
// Tranche 041 — journey 404 / dead-end fixes.
//
// Server-component redirect — renders nothing client-side.
// ---------------------------------------------------------------------------

import { redirect } from "next/navigation";

export default function AdminIndexRedirect(): never {
  redirect("/admin/items");
}
