"use client";

import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SideNav } from "./SideNav";

export function AppShellChrome({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <TopBar />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-10 px-8 py-8 xl:px-10 xl:py-10">
        <aside className="w-[232px] shrink-0">
          <div className="sticky top-[88px]">
            <SideNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
