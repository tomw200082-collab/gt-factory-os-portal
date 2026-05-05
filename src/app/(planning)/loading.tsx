// (planning) route-group loading fallback — table-style skeleton.
// Planning pages are heavy on tabular data (forecast cells, runs, recs).

import { GtLoader } from "@/components/ui/GtLoader";

export default function PlanningGroupLoading() {
  return (
    <main className="p-4 md:p-6 min-h-screen bg-bg" dir="rtl">
      <GtLoader.TopBar />
      <header className="mb-4 flex items-center gap-3">
        <GtLoader.Skeleton width={20} height={20} rounded="sm" />
        <GtLoader.Skeleton width={180} height={20} />
      </header>
      <div className="rounded-lg border border-border bg-bg-raised">
        <GtLoader.Table rows={10} cols={7} />
      </div>
    </main>
  );
}
