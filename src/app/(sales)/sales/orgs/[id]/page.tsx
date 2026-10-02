"use client";

// /sales/orgs/[id]: the business workspace (GT Pulse Unit B). It replaces the
// 448px org drawer as the primary place to work a business.

import { useParams } from "next/navigation";
import { OrgWorkspace } from "../../../_components/org/OrgWorkspace";

export default function OrgPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  return <OrgWorkspace key={id} orgId={id} />;
}
