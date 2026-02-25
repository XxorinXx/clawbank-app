import { test, expect } from "@playwright/test";

test.describe("Requests approval demo", () => {
  test("demo: full interaction flow — tab, modal, budget, advanced details, approve", async ({
    page,
  }) => {
    // Navigate to workspaces
    await page.goto("/workspaces");
    await page.waitForLoadState("networkidle");

    // Click workspace card
    const workspaceCard = page.getByText("Orin's Workspace").first();
    await expect(workspaceCard).toBeVisible({ timeout: 10_000 });
    await workspaceCard.click();

    // Requests tab should be active with badge
    const requestsTab = page.getByRole("tab", { name: /Requests/ });
    await expect(requestsTab).toBeVisible({ timeout: 10_000 });

    // 1. Show tab with badge and compact rows
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "e2e/screenshots/demo-01-requests-tab.png",
      fullPage: true,
    });

    // 2. Click "View more" to open modal
    const viewMoreButton = page.getByRole("button", { name: "View more" }).first();
    const hasViewMore = await viewMoreButton
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasViewMore) return;

    await viewMoreButton.click();
    await page.waitForTimeout(800);

    const modal = page.locator(".backdrop-blur-2xl");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "e2e/screenshots/demo-02-modal-open.png",
      fullPage: true,
    });

    // 3. Open Budget Context disclosure
    const budgetButton = page.getByText("Budget Context");
    const hasBudget = await budgetButton.isVisible().catch(() => false);
    if (hasBudget) {
      await budgetButton.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: "e2e/screenshots/demo-03-budget-expanded.png",
        fullPage: true,
      });
    }

    // 4. Open Advanced Details disclosure
    const advancedButton = page.getByText("Advanced Details");
    const hasAdvanced = await advancedButton.isVisible().catch(() => false);
    if (hasAdvanced) {
      await advancedButton.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: "e2e/screenshots/demo-04-advanced-details.png",
        fullPage: true,
      });
    }

    // 5. Click Approve in modal
    const approveButton = modal.getByRole("button", { name: "Approve" });
    const hasApprove = await approveButton.isVisible().catch(() => false);
    if (hasApprove) {
      await approveButton.click();
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: "e2e/screenshots/demo-05-approve-loading.png",
        fullPage: true,
      });
    }

    // 6. Close modal and go back to tab
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // 7. Show Activity tab
    const activityTab = page.getByRole("tab", { name: "Activity" });
    await activityTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: "e2e/screenshots/demo-06-activity-tab.png",
      fullPage: true,
    });
  });
});
