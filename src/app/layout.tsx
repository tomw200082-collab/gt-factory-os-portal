import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { SessionProvider } from "@/lib/auth/session-provider";
import { ReviewModeProvider } from "@/lib/review-mode/store";
import { QueryProvider } from "@/lib/query/query-provider";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { ReviewModePanel } from "@/components/review/ReviewModePanel";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${plexMono.variable}`}>
      <body className="font-sans">
        <QueryProvider>
          <SessionProvider>
            <ReviewModeProvider>
              <AppShellChrome>{children}</AppShellChrome>
              <ReviewModePanel />
            </ReviewModeProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
