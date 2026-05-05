// (po) Purchase Order pages loading fallback — table-style.

import { GtLoader } from "@/components/ui/GtLoader";

export default function PoGroupLoading() {
  return (
    <main className="p-4 md:p-6 min-h-screen bg-bg" dir="rtl">
      <GtLoader.TopBar />
      <header className="mb-4 flex items-center gap-3">
        <GtLoader.Skeleton width={20} height={20} rounded="sm" />
        <GtLoader.Skeleton width={140} height={20} />
      </header>
      <div className="rounded-lg border border-border bg-bg-raised">
        <GtLoader.Table rows={8} cols={6} />
      </div>
    </main>
  );
}
