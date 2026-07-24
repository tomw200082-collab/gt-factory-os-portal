import type { Metadata } from "next";
import { RunList } from "./_components/RunList";

// ---------------------------------------------------------------------------
// /production — the operator landing. Today's runs from the plan, ordered
// "make tank → fill A → fill B". A thin server shell; all data + interaction
// live in the <RunList> client component.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Today · Production",
};

export default function ProductionTodayPage() {
  return <RunList />;
}
