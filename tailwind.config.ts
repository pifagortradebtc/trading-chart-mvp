import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--tv-bg)",
        foreground: "var(--tv-text)",
        "tv-bg": "#050814",
        "tv-panel": "#0c101f",
        "tv-toolbar": "#12192c",
        "tv-border": "rgba(148,163,184,0.18)",
        "tv-text": "#e2e8f0",
        "tv-muted": "#94a3b8",
        "tv-accent": "#22d3ee",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Trebuchet MS"',
          "Roboto",
          "Ubuntu",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
