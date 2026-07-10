import { test, expect } from "@playwright/test";

test.describe("Nexus Authentication Flow", () => {
  test("should load the premium landing page successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("The AI-Powered Workplace");
    await expect(page.locator("text=Launch Workspace")).toBeVisible();
    await expect(page.locator("text=Consult Nova")).toBeVisible();
  });
});
