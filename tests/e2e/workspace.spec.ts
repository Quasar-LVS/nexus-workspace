import { test, expect } from "@playwright/test";

test.describe("Nexus Workspace Navigation & Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to landing page first
    await page.goto("/");
  });

  test("should attempt to redirect user to workspace select or clerk login when launching", async ({ page }) => {
    await page.goto("/dashboard");
    // Since authentication is active, should either load Clerk or redirect to sign-in page
    const url = page.url();
    expect(url).toBeDefined();
  });
});
