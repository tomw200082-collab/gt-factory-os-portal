// (inbox) route-group loading fallback — feed-style skeleton inside the
// existing layout chrome. Lighter than a full splash because the user is
// already inside the app and the navigation chrome has not unmounted.

import { GtLoader } from "@/components/ui/GtLoader";

export default function InboxGroupLoading() {
  return (
    <main className="p-4 md:p-6 min-h-screen bg-bg" dir="rtl">
      <GtLoader.TopBar />
      <header className="mb-3 flex items-center gap-3">
        <GtLoader.Skeleton width={20} height={20} rounded="sm" />
        <div className="space-y-1.5">
          <GtLoader.Skeleton width={120} height={18} />
          <GtLoader.Skeleton width={200} height={10} />
        </div>
      </header>
      <div className="flex gap-4">
        <aside className="w-56 shrink-0 space-y-3">
          <GtLoader.Skeleton width="100%" height={32} />
          <GtLoader.Skeleton width="100%" height={32} />
          <div className="space-y-1.5 pt-2">
            <GtLoader.Skeleton width="40%" height={10} />
            <GtLoader.Skeleton width="100%" height={20} />
            <GtLoader.Skeleton width="100%" height={20} />
            <GtLoader.Skeleton width="100%" height={20} />
          </div>
        </aside>
        <section className="flex-1 min-w-0">
          <GtLoader.Feed rows={6} />
        </section>
      </div>
    </main>
  );
}
