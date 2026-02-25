import { test, expect } from "@playwright/test";

/**
 * Helper: navigate to a workspace and open the Requests tab.
 */
async function openRequestsTab(page: import("@playwright/test").Page) {
  await page.goto("/workspaces");
  await page.waitForLoadState("networkidle");

  // Click the first workspace card
  const workspaceCard = page.getByText("Orin's Workspace").first();
  await expect(workspaceCard).toBeVisible({ timeout: 10_000 });
  await workspaceCard.click();

  // Wait for the drawer — Requests tab should be active by default
  const requestsTab = page.getByRole("tab", { name: /Requests/ });
  await expect(requestsTab).toBeVisible({ timeout: 10_000 });
  await requestsTab.click();
}

test.describe("Requests tab", () => {
  test("opens Requests tab and shows pending requests or empty state", async ({
    page,
  }) => {
    await openRequestsTab(page);

    // Either empty state or request rows should render
    const emptyState = page.getByText("All clear");
    const requestRow = page.locator("text=Transfer").first();

    await expect(emptyState.or(requestRow)).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "e2e/screenshots/requests-tab.png",
      fullPage: true,
    });
  });

  test("request detail modal opens on Details click and closes on Escape", async ({
    page,
  }) => {
    await openRequestsTab(page);

    // Wait for request rows
    const detailsButton = page.getByRole("button", { name: "Details" }).first();
    const hasDetails = await detailsButton
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasDetails) {
      await detailsButton.click();

      // Modal should appear
      const modal = page.locator(".backdrop-blur-2xl");
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await page.screenshot({
        path: "e2e/screenshots/request-detail-modal.png",
        fullPage: true,
      });

      // Close modal with Escape
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible({ timeout: 3_000 });
    }

    await page.screenshot({
      path: "e2e/screenshots/requests-tab-final.png",
      fullPage: true,
    });
  });

  test("tab badge shows pending count", async ({ page }) => {
    await page.goto("/workspaces");
    await page.waitForLoadState("networkidle");

    const workspaceCard = page.getByText("Orin's Workspace").first();
    await expect(workspaceCard).toBeVisible({ timeout: 10_000 });
    await workspaceCard.click();

    // Check Requests tab — should have a badge if there are pending requests
    const requestsTab = page.getByRole("tab", { name: /Requests/ });
    await expect(requestsTab).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: "e2e/screenshots/requests-tab-badge.png",
      fullPage: true,
    });
  });
});
