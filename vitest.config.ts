import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    // Exclude E2E suite — Playwright owns that.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/portfolio/**/*.ts"],
      exclude: [
        "**/*.{test,spec}.ts",
        "src/lib/portfolio/types.ts",
        "src/lib/portfolio/format.ts",
        "src/lib/portfolio/metricGlossary.ts",
        "src/lib/portfolio/strategyGlossary.ts",
        "src/lib/portfolio/defaultViews.ts",
        "src/lib/portfolio/marketCaps.ts",
        "src/lib/portfolio/market-data.ts",
        "src/lib/portfolio/use-mpt-worker.ts",
        "src/lib/portfolio/mpt-worker-client.ts",
        "src/lib/portfolio/storage.ts",
        "src/lib/portfolio/recommendationModes.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
