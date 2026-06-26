import Link from "next/link";
import { ArrowRight } from "lucide-react";

// UX-flow audit (FLOW-002): this route used to be a bare redirect("/me/activity")
// with no UI — anyone following a "submission" link or bookmark landed on a
// generic activity feed with no explanation. Give it a real page that states
// where stock submissions live and links there, instead of a silent redirect.
export default function StockSubmissionsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-lg font-semibold text-fg-strong">Stock submissions</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Your submitted stock counts, receipts, waste, and adjustments now live in
        My Activity — alongside the rest of what you&apos;ve done in the portal.
      </p>
      <Link
        href="/me/activity"
        className="btn btn-primary btn-sm mt-4 gap-1.5"
        data-testid="submissions-go-to-activity"
      >
        Go to My Activity
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </Link>
    </div>
  );
}
