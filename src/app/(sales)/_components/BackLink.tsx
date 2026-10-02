"use client";

// Back to where the person came from. Opened directly (a shared link, a new
// tab) there is nowhere to go back to, so it is a plain link to the list.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { UI } from "../_lib/labels";
import { cameFromSalesScreen } from "../_lib/salesHistory";

export function BackLink({ fallbackHref, fallbackLabel, testId }: { fallbackHref: string; fallbackLabel: string; testId?: string }) {
  const router = useRouter();
  const path = usePathname() ?? "";
  const [back, setBack] = useState(false);
  useEffect(() => setBack(cameFromSalesScreen(path)), [path]);
  return (
    <Link
      href={fallbackHref}
      className="s-org-back"
      data-testid={testId}
      onClick={(e) => {
        if (!back || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.back();
      }}
    >
      <ChevronRight size={16} aria-hidden />
      {back ? UI.back : fallbackLabel}
    </Link>
  );
}
