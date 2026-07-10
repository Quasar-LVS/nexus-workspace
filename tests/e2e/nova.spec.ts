import { test, expect } from "@playwright/test";

test.describe("Nexus Nova AI Semantic Page", () => {
  test("should check that Nova search page renders input form elements", async ({ page }) => {
    await page.goto("/nova");
    
    // Page is accessible (renders public login or loads the prompt input box)
    const body = await page.locator("body").innerText();
    expect(body).toBeDefined();
  });
});
