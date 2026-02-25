import { test as setup } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/session.json";

// Give yourself plenty of time to complete the login manually
setup.setTimeout(180_000);

/**
 * Interactive login setup.
 *
 * Run once with:   npm run test:e2e:login
 *
 * This opens a real Chrome browser so you can log in via Privy (email OTP).
 * After you're authenticated the browser state is saved to e2e/.auth/session.json
 * and reused by every subsequent test run.
 *
 * NOTE: Use email login, NOT Google — Google blocks OAuth from automated browsers.
 */
setup("authenticate via Privy", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click "Get started" to trigger Privy login
  await page.getByText("Get started").click();

  // ── Manual login ──
  // Use EMAIL login (not Google) — enter your email, check your inbox for
  // the OTP code, and type it in. You have 3 minutes.
  console.log("\n==========================================");
  console.log("  Use EMAIL login (not Google).");
  console.log("  Google blocks OAuth in automated browsers.");
  console.log("  You have 3 minutes to complete login.");
  console.log("==========================================\n");

  // Wait until the app redirects to /workspaces after auth
  await page.waitForURL("**/workspaces", { timeout: 180_000 });

  // Give Privy a moment to persist tokens to localStorage / cookies
  await page.waitForTimeout(3000);

  // Save the full browser state
  await page.context().storageState({ path: AUTH_FILE });

  console.log("\n Auth state saved to", AUTH_FILE);
});
