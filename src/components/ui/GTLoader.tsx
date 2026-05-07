"use client";

import { useEffect, useState } from "react";

// Brand color constants (petrol teal palette — matches :root.dark accent)
const T = {
  bg0: "hsl(30 12% 5%)",
  bg1: "hsl(30 12% 9%)",
  ring1a: "hsl(186 50% 55%)",
  ring1b: "hsl(186 40% 72%)",
  ring2a: "hsl(146 40% 56%)",
  ring2b: "hsl(32 72% 58%)",
  glow: "hsl(186 50% 50% / 0.1)",
  glowStrong: "hsl(186 50% 50% / 0.18)",
  gridLine: "hsl(186 50% 50% / 0.035)",
  textPrimary: "hsl(42 14% 84%)",
  textMuted: "hsl(42 6% 38%)",
  dot: "hsl(186 50% 58%)",
  dotGlow: "hsl(186 50% 58% / 0.5)",
  progressA: "hsl(186 50% 50%)",
  progressB: "hsl(186 40% 65%)",
  progressC: "hsl(146 40% 52%)",
  staticRing: "hsl(186 50% 50% / 0.14)",
};

export function GTLoader({ message }: { message?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      aria-label="Loading GT Factory OS"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 42%, ${T.bg1} 0%, ${T.bg0} 100%)`,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Subtle dot-grid texture */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(${T.gridLine} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }}
      />

      {/* Ambient glow blob */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.glow} 0%, transparent 65%)`,
          animation: "gt-pulse-glow 4s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* ── Logo ring container ── */}
      <div
        style={{
          position: "relative",
          width: 210,
          height: 210,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Outer ring — clockwise teal arc */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(from 0deg, transparent 0%, transparent 18%, ${T.ring1a} 36%, ${T.ring1b} 60%, transparent 76%)`,
            animation: "gt-spin 2.4s linear infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              background: T.bg1,
            }}
          />
        </div>

        {/* Inner ring — counter-spinning moss-amber arc */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 18,
            borderRadius: "50%",
            background: `conic-gradient(from 200deg, transparent 0%, transparent 22%, ${T.ring2a} 40%, ${T.ring2b} 62%, transparent 78%)`,
            animation: "gt-spin-r 3.6s linear infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 2,
              borderRadius: "50%",
              background: T.bg1,
            }}
          />
        </div>

        {/* Static glow ring */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 34,
            borderRadius: "50%",
            border: `1px solid ${T.staticRing}`,
            boxShadow: `0 0 28px ${T.glow}, inset 0 0 18px ${T.glowStrong}`,
          }}
        />

        {/* GT Monogram */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            animation:
              "gt-logo-in 0.75s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s both",
          }}
        >
          {/* Shimmer wrapper */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div
              style={{
                fontSize: 76,
                fontWeight: 800,
                letterSpacing: "-0.05em",
                lineHeight: 1,
                background: `linear-gradient(135deg, ${T.ring1b} 0%, ${T.ring1a} 42%, ${T.ring2a} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontFamily:
                  "var(--font-public-sans, ui-sans-serif, system-ui, sans-serif)",
                filter: `drop-shadow(0 0 18px hsl(186 50% 50% / 0.42))`,
                userSelect: "none",
              }}
            >
              GT
            </div>
            {/* Shimmer sweep */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: "55%",
                background:
                  "linear-gradient(90deg, transparent 0%, hsl(0 0% 100% / 0.15) 50%, transparent 100%)",
                animation: "gt-shimmer 2.8s ease-in-out 1.4s infinite",
                transform: "skewX(-12deg)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Brand text */}
      <div
        style={{
          marginTop: 28,
          textAlign: "center",
          animation: "gt-fade-up 0.6s ease 0.65s both",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.3em",
            color: T.textPrimary,
            fontFamily:
              "var(--font-public-sans, ui-sans-serif, system-ui, sans-serif)",
            textTransform: "uppercase",
          }}
        >
          GT Factory OS
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.4em",
            color: T.textMuted,
            marginTop: 6,
            fontFamily:
              "var(--font-public-sans, ui-sans-serif, system-ui, sans-serif)",
            textTransform: "uppercase",
          }}
        >
          {message ?? "Initializing…"}
        </div>
      </div>

      {/* Bouncing teal dots */}
      <div
        style={{
          display: "flex",
          gap: 7,
          marginTop: 22,
          animation: "gt-fade-up 0.6s ease 0.85s both",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: T.dot,
              animation: `gt-bounce 1.4s ease-in-out ${i * 0.19}s infinite`,
              boxShadow: `0 0 7px ${T.dotGlow}`,
            }}
          />
        ))}
      </div>

      {/* Bottom gradient progress bar */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "hsl(30 8% 14%)",
        }}
      >
        <div
          style={{
            height: "100%",
            background: `linear-gradient(90deg, ${T.progressA} 0%, ${T.progressB} 50%, ${T.progressC} 100%)`,
            animation: "gt-progress 2.8s cubic-bezier(0.4, 0, 0.2, 1) forwards",
          }}
        />
      </div>
    </div>
  );
}
