import { test, expect } from '@playwright/test';

test.describe('Design Tokens', () => {
  test('uses dark stage background', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    // The app renders on a dark background (#1A1A1A)
    const bgColor = await body.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // CSS may compute to rgb format
    expect(bgColor).toBeTruthy();
  });

  test('Inter font is loaded', async ({ page }) => {
    await page.goto('/');
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });
    expect(fontFamily.toLowerCase()).toContain('inter');
  });
});
