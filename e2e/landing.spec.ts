import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads successfully and shows main content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/); // page has a title
    await page.waitForLoadState("networkidle");

    // Screenshot of the landing page
    await page.screenshot({ path: "e2e/screenshots/landing.png", fullPage: true });
  });

  test("navigates to workspaces page", async ({ page }) => {
    await page.goto("/workspaces");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "e2e/screenshots/workspaces.png", fullPage: true });
  });
});
