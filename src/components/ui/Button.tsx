// ---------------------------------------------------------------------------
// Button — the React primitive over the token-driven `.btn` CSS class system
// (design-readiness PREP-10). Purely additive: it renders the exact same
// `.btn` / `.btn-{variant}` / `.btn-{size}` classes surfaces already use, but
// behind a typed component so (a) variants are enforced by TypeScript, (b)
// future loading/asChild behaviour has one home, and (c) a restyle changes one
// file instead of 100 call sites. Visuals come entirely from globals.css
// `@layer components`; this adds no styling of its own.
//
// Variants/sizes mirror the CSS classes exactly:
//   variant: default(.btn) | primary | danger | ghost | outline
//   size:    xs | sm | md(default, .btn is h-9) | lg
// ---------------------------------------------------------------------------

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "default"
  | "primary"
  | "danger"
  | "ghost"
  | "outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "",
  primary: "btn-primary",
  danger: "btn-danger",
  ghost: "btn-ghost",
  outline: "btn-outline",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Token-driven button. Defaults to a non-submitting `type="button"` to avoid
 *  accidental form submits — pass `type="submit"` explicitly when needed. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "default", size = "md", className, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("btn", VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
        {...rest}
      />
    );
  },
);
