"use client";

import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideNav } from "./SideNav";

export function AppShellChrome({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg focus:shadow-raised"
      >
        Skip to main content
      </a>
      <TopBar />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-4 md:gap-10 md:px-8 md:py-8 xl:px-10 xl:py-10">
        <nav aria-label="Primary navigation" className="hidden w-[232px] shrink-0 md:block">
          <div className="sticky top-[88px] max-h-[calc(100vh-88px)] overflow-y-auto pb-4 [scrollbar-width:thin]">
            <SideNav />
          </div>
        </nav>
        <main
          id="main-content"
          className="min-w-0 flex-1"
          style={{ paddingBottom: "max(4rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

