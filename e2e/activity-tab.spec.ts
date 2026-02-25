import { test, expect } from "@playwright/test";

/**
 * Helper: navigate to a workspace and open the Activity tab.
 */
async function openActivityTab(page: import("@playwright/test").Page) {
  await page.goto("/workspaces");
  await page.waitForLoadState("networkidle");

  // Click the first workspace card
  const workspaceCard = page.getByText("Orin's Workspace").first();
  await expect(workspaceCard).toBeVisible({ timeout: 10_000 });
  await workspaceCard.click();

  // Wait for the drawer, then click the Activity tab
  const activityTab = page.getByRole("tab", { name: "Activity" });
  await expect(activityTab).toBeVisible({ timeout: 10_000 });
  await activityTab.click();
}

test.describe("Activity tab", () => {
  test("opens Activity tab and shows filter pills with empty state or cards", async ({
    page,
  }) => {
    await openActivityTab(page);

    // Filter pills should always be visible
    const allPill = page.getByRole("button", { name: "All", exact: true });
    const transfersPill = page.getByRole("button", { name: "Transfers" });
    const configPill = page.getByRole("button", { name: "Config" });
    const agentsPill = page.getByRole("button", { name: "Agents" });

    await expect(allPill).toBeVisible({ timeout: 10_000 });
    await expect(transfersPill).toBeVisible();
    await expect(configPill).toBeVisible();
    await expect(agentsPill).toBeVisible();

    // "All" pill should be active
    await expect(allPill).toHaveClass(/bg-gray-900/);

    // Either empty state or activity cards should render
    const emptyState = page.getByText("No activity yet");
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasCards =
      (await page
        .locator("[class*='rounded-xl'][class*='border-gray-100']")
        .count()) > 0;
    expect(hasEmpty || hasCards).toBe(true);

    await page.screenshot({
      path: "e2e/screenshots/activity-tab.png",
      fullPage: true,
    });
  });

  test("filter pills change active state on click", async ({ page }) => {
    await openActivityTab(page);

    const allPill = page.getByRole("button", { name: "All", exact: true });
    const transfersPill = page.getByRole("button", { name: "Transfers" });

    await expect(allPill).toBeVisible({ timeout: 10_000 });

    // Click Transfers filter
    await transfersPill.click();
    await expect(transfersPill).toHaveClass(/bg-gray-900/);
    await expect(allPill).not.toHaveClass(/bg-gray-900/);

    // Click back to All
    await allPill.click();
    await expect(allPill).toHaveClass(/bg-gray-900/);
    await expect(transfersPill).not.toHaveClass(/bg-gray-900/);

    await page.screenshot({
      path: "e2e/screenshots/activity-tab-filtered.png",
      fullPage: true,
    });
  });

  test("activity detail modal opens and closes if activities exist", async ({
    page,
  }) => {
    await openActivityTab(page);

    // Wait for either empty state or cards
    const emptyState = page.getByText("No activity yet");
    const activityCard = page
      .locator("[class*='rounded-xl'][class*='border-gray-100']")
      .first();

    await expect(emptyState.or(activityCard)).toBeVisible({ timeout: 10_000 });

    const hasCards = await activityCard.isVisible().catch(() => false);

    if (hasCards) {
      // Click the first activity card to open modal
      await activityCard.click();

      // Modal should appear with liquid glass styling
      const modal = page.locator(".backdrop-blur-2xl");
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await page.screenshot({
        path: "e2e/screenshots/activity-detail-modal.png",
        fullPage: true,
      });

      // Close modal with Escape
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible({ timeout: 3_000 });
    }

    await page.screenshot({
      path: "e2e/screenshots/activity-tab-final.png",
      fullPage: true,
    });
  });
});
