import type { Config } from "tailwindcss";

/**
 * "Operational Precision" design system.
 *
 * Direction: modern control tower for a factory operations platform. Premium
 * B2B, not consumer. Industrial heritage. Designed to be read for eight-hour
 * shifts without eye fatigue.
 *
 * Foundation: warm bone paper background, deep graphite text, single petrol
 * teal accent (not generic SaaS blue), muted moss/amber/oxide for semantics.
 * 14px base typography. Hairline 1px borders at low opacity. Minimal shadows.
 * Tabular numerics throughout.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ——— Surfaces (warm bone, not cold white) ————————————————————————
        bg: {
          DEFAULT: "hsl(42 18% 95%)", // page — warm bone paper
          subtle: "hsl(42 16% 92%)", // section tint / table header
          muted: "hsl(42 14% 88%)", // disabled / well
          raised: "hsl(42 20% 98%)", // card interior (slightly brighter)
          deep: "hsl(40 10% 86%)", // deepest tint for nested wells
        },
        // ——— Ink (warm near-black graphite) ——————————————————————————————
        fg: {
          DEFAULT: "hsl(30 10% 10%)", // primary text
          strong: "hsl(30 14% 6%)", // headings
          muted: "hsl(30 6% 38%)", // secondary text
          subtle: "hsl(30 5% 54%)", // tertiary / helper text
          faint: "hsl(30 4% 68%)", // placeholder / rule text
          inverted: "hsl(42 20% 98%)", // text on dark backgrounds
        },
        // ——— Borders (hairlines at calibrated opacity) ——————————————————
        border: {
          DEFAULT: "hsl(30 8% 82%)",
          strong: "hsl(30 10% 70%)",
          faint: "hsl(30 8% 88%)",
          focus: "hsl(186 42% 24%)",
        },
        // ——— Accent: petrol teal (the signature) ————————————————————————
        accent: {
          DEFAULT: "hsl(186 42% 24%)", // deep petrol — primary action
          hover: "hsl(186 44% 20%)",
          soft: "hsl(186 38% 94%)", // soft backdrop
          softer: "hsl(186 40% 97%)",
          ring: "hsl(186 42% 24% / 0.3)",
          fg: "hsl(42 20% 98%)", // text on accent
          border: "hsl(186 32% 40%)",
        },
        // ——— Semantic: muted moss for success ———————————————————————————
        success: {
          DEFAULT: "hsl(146 34% 30%)",
          soft: "hsl(146 30% 94%)",
          softer: "hsl(146 30% 97%)",
          fg: "hsl(146 40% 20%)",
          border: "hsl(146 28% 60%)",
        },
        // ——— Semantic: burnt amber for warning ——————————————————————————
        warning: {
          DEFAULT: "hsl(32 78% 42%)",
          soft: "hsl(38 80% 94%)",
          softer: "hsl(38 84% 97%)",
          fg: "hsl(28 82% 28%)",
          border: "hsl(34 70% 62%)",
        },
        // ——— Semantic: oxidized red for danger ———————————————————————————
        danger: {
          DEFAULT: "hsl(4 66% 40%)",
          soft: "hsl(4 60% 94%)",
          softer: "hsl(4 60% 97%)",
          fg: "hsl(4 70% 30%)",
          border: "hsl(4 56% 60%)",
        },
        // ——— Semantic: slate blue for info (quieter than accent) ——————
        info: {
          DEFAULT: "hsl(210 32% 38%)",
          soft: "hsl(210 30% 94%)",
          softer: "hsl(210 32% 97%)",
          fg: "hsl(210 40% 26%)",
          border: "hsl(210 26% 58%)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-public-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-plex-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Operational density — 14px base, not consumer 16px.
        "3xs": ["0.625rem", { lineHeight: "0.875rem", letterSpacing: "0.04em" }],
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.875rem", { lineHeight: "1.35rem" }],
        md: ["0.9375rem", { lineHeight: "1.45rem" }],
        lg: ["1.0625rem", { lineHeight: "1.55rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "1.95rem", letterSpacing: "-0.01em" }],
        "3xl": ["1.875rem", { lineHeight: "2.3rem", letterSpacing: "-0.015em" }],
        "4xl": ["2.25rem", { lineHeight: "2.6rem", letterSpacing: "-0.02em" }],
      },
      letterSpacing: {
        tightish: "-0.01em",
        tight: "-0.015em",
        tighter: "-0.02em",
        ops: "0.08em",
        sops: "0.12em",
      },
      borderRadius: {
        none: "0",
        xs: "3px",
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        none: "none",
        hairline: "0 0 0 1px hsl(30 8% 82% / 1)",
        "hairline-strong": "0 0 0 1px hsl(30 10% 70% / 1)",
        raised:
          "0 1px 0 0 hsl(30 10% 80% / 0.4), 0 1px 2px 0 hsl(30 12% 10% / 0.04)",
        pop:
          "0 2px 6px -1px hsl(30 12% 10% / 0.06), 0 8px 24px -4px hsl(30 12% 10% / 0.08), 0 0 0 1px hsl(30 10% 80% / 0.5)",
        "focus-ring": "0 0 0 3px hsl(186 42% 24% / 0.18)",
        "danger-ring": "0 0 0 3px hsl(4 66% 40% / 0.18)",
      },
      spacing: {
        "4.5": "1.125rem",
        "5.5": "1.375rem",
        "6.5": "1.625rem",
        "7.5": "1.875rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "17": "4.25rem",
        "18": "4.5rem",
        "22": "5.5rem",
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 320ms cubic-bezier(0.165, 0.84, 0.44, 1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
