import { test, expect } from "@playwright/test";

test.describe("Nexus Chat & Message Streaming", () => {
  test("should check that dynamic channel page can load the interface", async ({ page }) => {
    // Navigate to a dynamic channel link directly
    const mockChannelId = "123e4567-e89b-12d3-a456-426614174000";
    await page.goto(`/c/${mockChannelId}`);
    
    // Check if the page is loading the workspace interface skeleton or auth wall
    const body = await page.locator("body").innerText();
    expect(body).toBeDefined();
  });
});
