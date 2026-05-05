// (planner) Planner-only pages loading fallback — list-style.

import { GtLoader } from "@/components/ui/GtLoader";

export default function PlannerGroupLoading() {
  return (
    <main className="p-4 md:p-6 min-h-screen bg-bg" dir="rtl">
      <GtLoader.TopBar />
      <header className="mb-4 flex items-center gap-3">
        <GtLoader.Skeleton width={20} height={20} rounded="sm" />
        <GtLoader.Skeleton width={180} height={20} />
      </header>
      <GtLoader.Feed rows={8} />
    </main>
  );
}
