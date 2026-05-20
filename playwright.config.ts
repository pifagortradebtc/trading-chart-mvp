import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the /portfolio E2E suite.
 *
 * We boot a local dev server (`npm run dev`) on port 3000 and run a single
 * Chromium project. The fund's first-paint workflow (MC cloud, market caps)
 * needs ~5-10s, so we use generous timeouts to avoid false flakes — these
 * are research-tool tests, not unit-time-budget micro-benchmarks.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  webServer: {
    // Local Pifagor Fund dev workflow keeps a long-running `npm run dev` open;
    // we reuse it rather than spinning up a parallel one. Set PW_START_DEV=1
    // to force a managed server (e.g. for CI).
    command: "npm run dev -- --port 3001",
    url: "http://localhost:3001",
    timeout: 120_000,
    reuseExistingServer: !process.env.PW_START_DEV,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
