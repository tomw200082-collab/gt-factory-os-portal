// (ops) route-group loading fallback — operator-form pages (Goods Receipt,
// Physical Count, Waste, Production Actual). Cards-style skeleton.

import { GtLoader } from "@/components/ui/GtLoader";

export default function OpsGroupLoading() {
  return (
    <main className="p-4 md:p-6 min-h-screen bg-bg" dir="rtl">
      <GtLoader.TopBar />
      <header className="mb-4 flex items-center gap-3">
        <GtLoader.Skeleton width={20} height={20} rounded="sm" />
        <GtLoader.Skeleton width={160} height={20} />
      </header>
      <GtLoader.Cards count={6} />
    </main>
  );
}
