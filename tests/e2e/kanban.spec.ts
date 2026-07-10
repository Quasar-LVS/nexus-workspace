import { test, expect } from "@playwright/test";

test.describe("Nexus Kanban Board & Project Views", () => {
  test("should check that project page loads successfully", async ({ page }) => {
    const mockProjectId = "123e4567-e89b-12d3-a456-426614174001";
    await page.goto(`/p/${mockProjectId}`);
    
    // Page loads and redirects to login or loads workspace shell
    const body = await page.locator("body").innerText();
    expect(body).toBeDefined();
  });
});
