// The in-shell route skeleton (tranche 206, gate F1).
//
// A cold route chunk used to suspend at the root loading.tsx, which hid the
// whole shell behind the full-screen GT loader. The shells now wrap their page
// slot in <Suspense fallback={<ContentSkeleton />}>: the top bar and the nav stay
// mounted and only the content area waits. The root loading.tsx is unchanged
// and still covers the first request, before any shell exists.
//
// A title bar and four rows in the one shared skeleton look (animate-pulse, see
// globals.css). Decorative: the busy state is announced on <main> by the
// navigation loader, so the blocks carry no text.
export function ContentSkeleton() {
  return (
    <div data-content-skeleton aria-hidden="true" className="space-y-4">
      <div className="gt-skel-block animate-pulse h-8 w-1/3 min-w-[10rem]" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="gt-skel-block animate-pulse h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
