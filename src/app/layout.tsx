import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "@/lib/auth/session-provider";
import { ReviewModeProvider } from "@/lib/review-mode/store";
import { QueryProvider } from "@/lib/query/query-provider";
import { ReviewModePanel } from "@/components/review/ReviewModePanel";
import { ThemeProvider } from "@/lib/theme";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-public-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GT Factory OS — Portal",
  description:
    "Operations portal shell — master data, operator forms, planning workspaces, control tower.",
};

// Mobile-first viewport. `viewport-fit=cover` respects notches / safe-insets
// on iPhone; `maximumScale: 5` allows the OS pinch-to-zoom accessibility
// affordance while keeping initialScale=1 so the portal renders at actual
// pixel density (mobile browsers default to an assumed 980px without this).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

// DEV_SHIM_ENABLED is a build-time constant. ReviewModePanel is only rendered
// in dev-shim mode since it is a dev/staging-only affordance.
const DEV_SHIM_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body className="font-sans">
        <QueryProvider>
          <SessionProvider>
            <ThemeProvider>
              <ReviewModeProvider>
                {children}
                {DEV_SHIM_ENABLED ? <ReviewModePanel /> : null}
              </ReviewModeProvider>
            </ThemeProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
