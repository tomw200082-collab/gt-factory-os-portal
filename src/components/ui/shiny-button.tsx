"use client";

// ---------------------------------------------------------------------------
// ShinyButton — Magic UI's animated shine button
// (registry: `@magicui/shiny-button`, https://magicui.design).
//
// Adapted to this repo's conventions:
//   • `cn` imported from `@/lib/cn` (not the shadcn default `@/lib/utils`).
//   • The shine is driven by this design system's signature token `--accent`
//     (petrol teal) rather than Magic UI's stock `--primary`, which this
//     "Operational Precision" theme does not define. See tailwind.config.ts /
//     globals.css for the token values (defined twice: :root and :root.dark).
// Visuals are otherwise the upstream component verbatim.
// ---------------------------------------------------------------------------

import { type HTMLMotionProps, motion } from "motion/react";
import React from "react";

import { cn } from "@/lib/cn";

const animationProps = {
  initial: { "--x": "100%", scale: 0.8 },
  animate: { "--x": "-100%", scale: 1 },
  whileTap: { scale: 0.95 },
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
    scale: {
      type: "spring",
      stiffness: 200,
      damping: 5,
      mass: 0.5,
    },
  },
} as HTMLMotionProps<"button">;

interface ShinyButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  children: React.ReactNode;
  className?: string;
}

export const ShinyButton = React.forwardRef<
  HTMLButtonElement,
  ShinyButtonProps
>(({ children, className, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      className={cn(
        "relative cursor-pointer rounded-lg px-6 py-2 font-medium backdrop-blur-xl border transition-shadow duration-300 ease-in-out hover:shadow dark:bg-[radial-gradient(circle_at_50%_0%,hsl(var(--accent)/10%)_0%,transparent_60%)] dark:hover:shadow-[0_0_20px_hsl(var(--accent)/10%)]",
        className,
      )}
      {...animationProps}
      {...props}
    >
      <span
        className="relative block size-full text-sm uppercase tracking-wide text-[rgb(0,0,0,65%)] dark:font-light dark:text-[rgb(255,255,255,90%)]"
        style={{
          maskImage:
            "linear-gradient(-75deg,hsl(var(--accent)) calc(var(--x) + 20%),transparent calc(var(--x) + 30%),hsl(var(--accent)) calc(var(--x) + 100%))",
        }}
      >
        {children}
      </span>
      <span
        style={{
          mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
          maskComposite: "exclude",
        }}
        className="absolute inset-0 z-10 block rounded-[inherit] bg-[linear-gradient(-75deg,hsl(var(--accent)/10%)_calc(var(--x)+20%),hsl(var(--accent)/50%)_calc(var(--x)+25%),hsl(var(--accent)/10%)_calc(var(--x)+100%))] p-px"
      />
    </motion.button>
  );
});

ShinyButton.displayName = "ShinyButton";
