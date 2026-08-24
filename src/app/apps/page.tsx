"use client";

// The post-login fork: factory or sales.
//
// It is a switchboard, not a landing page. Anyone who only has one workspace
// never sees it, and anyone who has already chosen is forwarded straight
// through — the other workspace stays one tap away inside each shell rather
// than behind a timed interstitial nobody wants twice a day.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Factory, TrendingUp } from "lucide-react";
import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import type { Role } from "@/lib/contracts/enums";

const COOKIE = "gt.app.v1";
const FACTORY_HOME = "/home";
const SALES_HOME = "/sales/today";

/**
 * The capability, not the role.
 *
 * This read "role === 'admin'" and was missed when the sales axis landed, which
 * made it the worst possible place for the omission: /apps is the default
 * post-login destination, so a sales_rep signing in was forwarded straight past
 * the only screen that offers their workspace, into a factory /home where every
 * nav rail is empty for them.
 */
function hasSalesAccess(role: Role | undefined): boolean {
  return role ? authorizeCapability(role, "sales:execute") : false;
}

function readRemembered(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)gt\.app\.v1=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function remember(app: "factory" | "sales"): void {
  document.cookie = `${COOKIE}=${app}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function AppsPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const role = session?.role;
  const salesAllowed = hasSalesAccess(role);

  useEffect(() => {
    // The provider reports `viewer` while it loads; deciding on that would
    // bounce an admin out of their own switchboard.
    if (isLoading) return;

    if (!salesAllowed) {
      router.replace(FACTORY_HOME);
      return;
    }
    const remembered = readRemembered();
    if (remembered === "sales") router.replace(SALES_HOME);
    else if (remembered === "factory") router.replace(FACTORY_HOME);
  }, [isLoading, salesAllowed, router]);

  if (isLoading || !salesAllowed) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <span className="sr-only">טוען…</span>
      </div>
    );
  }

  return (
    <div data-app="sales" dir="rtl" lang="he" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
        לאן היום?
      </h1>
      <p className="mt-1 text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>
        אפשר להחליף בכל רגע מתוך כל אחת מהמערכות.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          data-testid="apps-card-factory"
          onClick={() => {
            remember("factory");
            router.replace(FACTORY_HOME);
          }}
          className="s-card s-enter flex min-h-[132px] flex-col items-start gap-2 p-5 text-start"
        >
          <Factory size={22} aria-hidden style={{ color: "hsl(var(--s-fg-muted))" }} />
          <span className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            ייצור
          </span>
          <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            מלאי, תכנון, הזמנות רכש
          </span>
        </button>

        <button
          type="button"
          data-testid="apps-card-sales"
          onClick={() => {
            remember("sales");
            router.replace(SALES_HOME);
          }}
          className="s-card s-enter flex min-h-[132px] flex-col items-start gap-2 p-5 text-start"
          style={{ borderColor: "hsl(var(--s-accent))" }}
        >
          <TrendingUp size={22} aria-hidden style={{ color: "hsl(var(--s-accent))" }} />
          <span className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            מכירות
          </span>
          <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            תור העבודה, לידים, עסקים
          </span>
        </button>
      </div>
    </div>
  );
}
