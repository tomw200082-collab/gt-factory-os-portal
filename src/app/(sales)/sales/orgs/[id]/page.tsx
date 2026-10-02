"use client";

// /sales/orgs/[id]: the business workspace (GT Pulse Unit B). It replaces the
// 448px org drawer as the primary place to work a business.

import { useParams } from "next/navigation";
import { OrgWorkspace } from "../../../_components/org/OrgWorkspace";

/** A malformed escape is not a crash: it goes on as is and the API calls it a bad id (400). */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default function OrgPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? safeDecode(params.id) : "";
  return <OrgWorkspace key={id} orgId={id} />;
}
