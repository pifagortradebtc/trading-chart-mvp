import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ── Legacy (TradingView-style chart bg, charts use them directly) ──
        background: "var(--bg-deep)",
        foreground: "var(--ink)",
        "tv-bg": "#060a10",
        "tv-panel": "#0c121c",
        "tv-toolbar": "#12192c",
        "tv-border": "rgba(201,169,98,0.12)",
        "tv-text": "#e8eaf0",
        "tv-muted": "#8b93a8",
        "tv-accent": "#c9a962",

        // ── Pifagor Fund palette ──
        brand: {
          DEFAULT: "#c9a962",
          dark: "#a88b4a",
          light: "#dcc285",
          muted: "rgba(201, 169, 98, 0.15)",
          glow: "rgba(201, 169, 98, 0.22)",
        },
        surface: {
          DEFAULT: "rgba(18, 24, 38, 0.72)",
          elevated: "rgba(24, 32, 48, 0.88)",
          border: "rgba(201, 169, 98, 0.12)",
          "border-strong": "rgba(201, 169, 98, 0.24)",
        },
        ink: {
          DEFAULT: "#e8eaf0",
          muted: "#8b93a8",
          faint: "#5c6478",
        },
      },
      fontFamily: {
        display: ['"Geist Sans"', '"IBM Plex Sans"', "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        "display-tight": "-0.025em",
        "display-tighter": "-0.04em",
      },
      boxShadow: {
        card:
          "0 4px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        "card-hover":
          "0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(201, 169, 98, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        glow: "0 0 40px rgba(201, 169, 98, 0.08)",
        "glow-strong":
          "0 0 80px rgba(201, 169, 98, 0.16), 0 0 32px rgba(201, 169, 98, 0.10)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.45s ease-out forwards",
        "aurora-drift": "auroraDrift 24s ease-in-out infinite",
        "pulse-dot": "pulseDot 2.4s ease-in-out infinite",
        "spin-slow": "spin 60s linear infinite",
        "grid-fade": "gridFade 8s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        auroraDrift: {
          "0%, 100%": { transform: "translate(0%, 0%) rotate(0deg) scale(1)" },
          "33%": { transform: "translate(8%, -6%) rotate(40deg) scale(1.08)" },
          "66%": { transform: "translate(-6%, 4%) rotate(-30deg) scale(0.96)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
        gridFade: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.55" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
