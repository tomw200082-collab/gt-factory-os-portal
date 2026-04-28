import type { Config } from "tailwindcss";

/**
 * "Operational Precision" design system.
 *
 * Direction: modern control tower for a factory operations platform. Premium
 * B2B, not consumer. Industrial heritage. Designed to be read for eight-hour
 * shifts without eye fatigue.
 *
 * Light theme: warm bone paper background, deep graphite text, single petrol
 * teal accent (not generic SaaS blue), muted moss/amber/oxide for semantics.
 * Dark theme: warm graphite background (not OLED black), warm off-white text,
 * petrol teal lifted in luminosity to remain readable. Soft semantic backdrops
 * flip to dark-with-hint pattern. See src/app/globals.css for the actual HSL
 * values (defined twice — :root and :root.dark).
 *
 * 14px base typography. Hairline 1px borders at low opacity. Minimal shadows.
 * Tabular numerics throughout.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ——— Surfaces ———————————————————————————————————————————————————
        bg: {
          DEFAULT: "hsl(var(--bg) / <alpha-value>)",
          subtle:  "hsl(var(--bg-subtle) / <alpha-value>)",
          muted:   "hsl(var(--bg-muted) / <alpha-value>)",
          raised:  "hsl(var(--bg-raised) / <alpha-value>)",
          deep:    "hsl(var(--bg-deep) / <alpha-value>)",
        },
        // ——— Foreground (ink) —————————————————————————————————————————
        fg: {
          DEFAULT:  "hsl(var(--fg) / <alpha-value>)",
          strong:   "hsl(var(--fg-strong) / <alpha-value>)",
          muted:    "hsl(var(--fg-muted) / <alpha-value>)",
          subtle:   "hsl(var(--fg-subtle) / <alpha-value>)",
          faint:    "hsl(var(--fg-faint) / <alpha-value>)",
          inverted: "hsl(var(--fg-inverted) / <alpha-value>)",
        },
        // ——— Borders ———————————————————————————————————————————————
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong:  "hsl(var(--border-strong) / <alpha-value>)",
          faint:   "hsl(var(--border-faint) / <alpha-value>)",
          focus:   "hsl(var(--border-focus) / <alpha-value>)",
        },
        // ——— Accent: petrol teal (the signature) ————————————————————————
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          hover:   "hsl(var(--accent-hover) / <alpha-value>)",
          soft:    "hsl(var(--accent-soft) / <alpha-value>)",
          softer:  "hsl(var(--accent-softer) / <alpha-value>)",
          ring:    "hsl(var(--accent) / 0.3)",
          fg:      "hsl(var(--accent-fg) / <alpha-value>)",
          border:  "hsl(var(--accent-border) / <alpha-value>)",
        },
        // ——— Semantic: muted moss for success ———————————————————————————
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          soft:    "hsl(var(--success-soft) / <alpha-value>)",
          softer:  "hsl(var(--success-softer) / <alpha-value>)",
          fg:      "hsl(var(--success-fg) / <alpha-value>)",
          border:  "hsl(var(--success-border) / <alpha-value>)",
        },
        // ——— Semantic: burnt amber for warning ——————————————————————————
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          soft:    "hsl(var(--warning-soft) / <alpha-value>)",
          softer:  "hsl(var(--warning-softer) / <alpha-value>)",
          fg:      "hsl(var(--warning-fg) / <alpha-value>)",
          border:  "hsl(var(--warning-border) / <alpha-value>)",
        },
        // ——— Semantic: oxidized red for danger ———————————————————————————
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          soft:    "hsl(var(--danger-soft) / <alpha-value>)",
          softer:  "hsl(var(--danger-softer) / <alpha-value>)",
          fg:      "hsl(var(--danger-fg) / <alpha-value>)",
          border:  "hsl(var(--danger-border) / <alpha-value>)",
        },
        // ——— Semantic: slate blue for info (quieter than accent) ——————
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          soft:    "hsl(var(--info-soft) / <alpha-value>)",
          softer:  "hsl(var(--info-softer) / <alpha-value>)",
          fg:      "hsl(var(--info-fg) / <alpha-value>)",
          border:  "hsl(var(--info-border) / <alpha-value>)",
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
        hairline: "0 0 0 1px hsl(var(--border) / 1)",
        "hairline-strong": "0 0 0 1px hsl(var(--border-strong) / 1)",
        raised:
          "0 1px 0 0 hsl(var(--shadow-color) / 0.4), 0 1px 2px 0 hsl(var(--shadow-color-deep) / 0.04)",
        pop:
          "0 2px 6px -1px hsl(var(--shadow-color-deep) / 0.06), 0 8px 24px -4px hsl(var(--shadow-color-deep) / 0.08), 0 0 0 1px hsl(var(--shadow-color) / 0.5)",
        "focus-ring": "0 0 0 3px hsl(var(--accent) / 0.18)",
        "danger-ring": "0 0 0 3px hsl(var(--danger) / 0.18)",
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
