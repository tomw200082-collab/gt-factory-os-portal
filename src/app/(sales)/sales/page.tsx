import { redirect } from "next/navigation";

// /sales has no screen of its own — the work is the queue.
export default function SalesIndexPage() {
  redirect("/sales/today");
}
