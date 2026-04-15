import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface AppPageShellProps {
  children: ReactNode;
  className?: string;
}

export function AppPageShell({ children, className }: AppPageShellProps) {
  return (
    <div className={cn("flex min-h-full flex-col gap-6", className)}>
      {children}
    </div>
  );
}
