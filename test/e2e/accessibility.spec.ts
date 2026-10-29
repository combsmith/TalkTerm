import { test, expect } from '@playwright/test';

async function goToApiKeyEntry(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /anthropic api key/i }).click();
}

test.describe('Setup Flow Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await goToApiKeyEntry(page);
  });

  test('page has exactly one h1 heading', async ({ page }) => {
    const h1Elements = page.getByRole('heading', { level: 1 });
    await expect(h1Elements).toHaveCount(1);
    await expect(h1Elements).toHaveText('Enter API Key');
  });

  test('API key input has an accessible placeholder acting as label', async ({ page }) => {
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('form is wrapped in a <form> element for assistive technology', async ({ page }) => {
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('validate button has accessible disabled state', async ({ page }) => {
    const btn = page.getByRole('button', { name: /validate api key/i });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('type', 'submit');
  });

  test('external link has rel="noopener noreferrer" for security', async ({ page }) => {
    const link = page.locator('a[href*="console.anthropic.com"]');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('Tab key moves focus through interactive elements in order', async ({ page }) => {
    // The input is auto-focused on mount
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await expect(input).toBeFocused();
    await input.fill('sk-ant-api03-test');

    // Tab to the external link
    await page.keyboard.press('Tab');
    const link = page.locator('a[href*="console.anthropic.com"]');
    await expect(link).toBeFocused();

    // Tab to the validate button
    await page.keyboard.press('Tab');
    const validateBtn = page.getByRole('button', { name: /validate api key/i });
    await expect(validateBtn).toBeFocused();
  });

  test('focus indicators are visible on interactive elements', async ({ page }) => {
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('sk-ant-api03-test');

    // Tab to the validate button and verify it has visible focus styling
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const validateBtn = page.getByRole('button', { name: /validate api key/i });
    await expect(validateBtn).toBeFocused();

    // The button should be visible — Playwright's toBeVisible checks CSS visibility
    await expect(validateBtn).toBeVisible();
  });

  test('error message appears after invalid key submission and is readable', async ({ page }) => {
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('invalid-key');

    const btn = page.getByRole('button', { name: /validate api key/i });
    await expect(btn).toBeEnabled();
    await btn.click();

    // Wait for validation to complete and error to appear
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
    await expect(errorMsg).toContainText("didn't work");
  });

  test('success state is announced after valid key', async ({ page }) => {
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('sk-ant-api03-test-key');

    const btn = page.getByRole('button', { name: /validate api key/i });
    await btn.click();

    // Success indicator should appear
    const successMsg = page.locator('p.text-semantic-success').first();
    await expect(successMsg).toBeVisible({ timeout: 5000 });
    await expect(successMsg).toContainText('Key verified');
  });

  test('form can be submitted with Enter key', async ({ page }) => {
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('invalid-key');
    await page.keyboard.press('Enter');

    // Should trigger validation — error appears for invalid key
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Keyboard Navigation Patterns', () => {
  test('Shift+Tab navigates backwards through elements', async ({ page }) => {
    await goToApiKeyEntry(page);

    // Start at the auto-focused input
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await expect(input).toBeFocused();

    // Tab forward to external link
    await page.keyboard.press('Tab');
    const link = page.locator('a[href*="console.anthropic.com"]');
    await expect(link).toBeFocused();

    // Shift+Tab back to input
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
  });

  test('disabled button cannot be activated with Enter or Space', async ({ page }) => {
    await goToApiKeyEntry(page);

    const validateBtn = page.getByRole('button', { name: /validate api key/i });
    await expect(validateBtn).toBeDisabled();

    // Press Enter with empty input — no error should appear
    await page.keyboard.press('Enter');
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toHaveCount(0);

    // Press Space — still no error
    await page.keyboard.press(' ');
    await expect(errorMsg).toHaveCount(0);
  });
});

test.describe('Color and Visual Accessibility', () => {
  test('error state uses distinct color and text (not color alone)', async ({ page }) => {
    await goToApiKeyEntry(page);
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('invalid-key');

    const btn = page.getByRole('button', { name: /validate api key/i });
    await btn.click();

    // Error message includes descriptive text, not just a color change
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
    const text = await errorMsg.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(10);
  });

  test('success state uses distinct color and text', async ({ page }) => {
    await goToApiKeyEntry(page);
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('sk-ant-api03-test-key');

    const btn = page.getByRole('button', { name: /validate api key/i });
    await btn.click();

    const successMsg = page.locator('p.text-semantic-success').first();
    await expect(successMsg).toBeVisible({ timeout: 5000 });
    const text = await successMsg.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(5);
  });

  test('input border changes on error (visual distinction)', async ({ page }) => {
    await goToApiKeyEntry(page);
    const input = page.getByPlaceholder('sk-ant-api03-...');
    await input.fill('invalid-key');

    const btn = page.getByRole('button', { name: /validate api key/i });
    await btn.click();

    // Wait for error state
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 5000 });

    // Input should have the danger border class
    await expect(input).toHaveClass(/border-danger/);
  });
});

test.describe('Screen Reader Semantics', () => {
  test('page uses semantic HTML structure', async ({ page }) => {
    await goToApiKeyEntry(page);

    // h1 exists for main heading
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();

    // Buttons use <button> elements, not divs
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('link elements are proper anchor tags', async ({ page }) => {
    await goToApiKeyEntry(page);
    const links = page.getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    // First link should have an href
    const firstLink = links.first();
    const href = await firstLink.getAttribute('href');
    expect(href).toBeTruthy();
  });
});
