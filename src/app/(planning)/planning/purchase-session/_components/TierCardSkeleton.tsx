// Tier-shaped loading skeleton for /planning/purchase-session.
//
// Renders N card frames sized to match the live PO card rhythm so the
// layout doesn't jump when the data resolves. Pure presentational; no
// data, no animation library, no shared-component changes.

interface TierCardSkeletonProps {
  count?: number;
}

export function TierCardSkeleton({ count = 3 }: TierCardSkeletonProps) {
  return (
    <div className="space-y-3" aria-hidden data-testid="purchase-session-skeleton">
      <div className="card p-4 space-y-3">
        <div className="h-3 w-40 rounded bg-bg-subtle" />
        <div className="h-2 w-full rounded-full bg-bg-subtle" />
        <div className="flex gap-2">
          <div className="h-3 w-16 rounded-full bg-bg-subtle" />
          <div className="h-3 w-20 rounded-full bg-bg-subtle" />
          <div className="h-3 w-24 rounded-full bg-bg-subtle" />
        </div>
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-40 rounded bg-bg-subtle" />
              <div className="h-3 w-16 rounded-full bg-bg-subtle" />
              <div className="h-3 w-20 rounded-full bg-bg-subtle" />
            </div>
            <div className="h-3 w-20 rounded bg-bg-subtle" />
          </div>
          <div className="h-2 w-2/3 rounded bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}
