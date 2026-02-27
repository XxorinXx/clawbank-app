import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  retries: 0,
  reporter: [["html", { outputFolder: "./e2e/playwright-report" }]],

  use: {
    baseURL: "http://localhost:5173",
    // Capture evidence for every test
    screenshot: "on",
    video: "on",
    trace: "on",
  },

  projects: [
    // One-time interactive login — run with: npm run test:e2e:login
    // Uses real Chrome to avoid Google/Privy bot detection
    {
      name: "setup",
      testMatch: "auth.setup.ts",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },

    // All E2E tests — run with saved auth session
    {
      name: "chromium",
      testMatch: "**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/session.json",
      },
      dependencies: [],
    },
  ],

  // Auto-start the dev server when running tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
