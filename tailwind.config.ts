import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--tv-bg)",
        foreground: "var(--tv-text)",
        "tv-bg": "#0c0e14",
        "tv-panel": "#131722",
        "tv-toolbar": "#1e222d",
        "tv-border": "#2e3241",
        "tv-text": "#d1d4dc",
        "tv-muted": "#787b86",
        "tv-accent": "#2962ff",
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
