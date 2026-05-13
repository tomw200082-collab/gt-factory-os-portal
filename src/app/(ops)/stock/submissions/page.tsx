import { redirect } from "next/navigation";

export default function StockSubmissionsRedirect() {
  redirect("/me/activity");
}
