/**
 * E2E tests for keyboard-only navigation (NFR11: 32x32 click targets, NFR16: keyboard nav).
 *
 * These tests do NOT require a real ANTHROPIC_API_KEY.
 * Run: npx playwright test test/e2e/keyboard-navigation.spec.ts --config playwright.config.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

let app: ElectronApplication;
let page: Page;

const USER_DATA_PATH = path.join(
  process.env['HOME'] ?? '/tmp',
  'Library/Application Support/TalkTerm-keyboard-nav-test',
);

test.beforeAll(async () => {
  if (fs.existsSync(USER_DATA_PATH)) {
    fs.rmSync(USER_DATA_PATH, { recursive: true });
  }

  const env = { ...process.env, ELECTRON_USER_DATA_DIR: USER_DATA_PATH } as Record<string, string>;
  delete (env as Record<string, string | undefined>)['ANTHROPIC_API_KEY'];

  app = await electron.launch({
    args: ['--no-sandbox', path.join(__dirname, '../../.vite/build/main.cjs')],
    env,
  });

  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test.describe('Keyboard Navigation (NFR11 + NFR16)', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. API key input auto-focuses on mount', async () => {
    const heading = page.locator('h1');
    await expect(heading).toContainText('Get Started', { timeout: 15000 });

    const apiKeyOption = page.getByRole('button', { name: /anthropic api key/i });
    if (await apiKeyOption.isVisible().catch(() => false)) {
      await apiKeyOption.click();
    }

    const input = page.locator('input[type="password"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(input).toBeFocused();
  });

  test('2. Tab moves focus between elements on setup screen', async () => {
    // Start from the focused password input, Tab to next focusable element
    await page.keyboard.press('Tab');
    const link = page.locator('a[href*="console.anthropic.com"]');
    const validateBtn = page.getByRole('button', { name: /validate/i });

    // One of these should now be focused after tabbing
    const linkFocused = await link
      .evaluate((el) => document.activeElement === el)
      .catch(() => false);
    const btnFocused = await validateBtn
      .evaluate((el) => document.activeElement === el)
      .catch(() => false);
    expect(linkFocused || btnFocused).toBe(true);
  });

  test('3. Enter triggers validate on API key screen', async () => {
    // Focus the input and type a key, then press Enter to submit
    const input = page.locator('input[type="password"]');
    await input.focus();
    await input.fill('sk-ant-api03-test-keyboard');
    await page.keyboard.press('Enter');

    // Validation triggers -- either success or server validation feedback appears
    const feedback = page.locator('p.text-semantic-success, p.text-danger');
    await expect(feedback).toBeVisible({ timeout: 10000 });
  });

  test('4. Interactive elements meet 32x32 minimum click target (NFR11)', async () => {
    const buttons = page.getByRole('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;

      const box = await btn.boundingBox();
      if (box === null) continue;

      expect(box.width, `Button ${i} width`).toBeGreaterThanOrEqual(32);
      expect(box.height, `Button ${i} height`).toBeGreaterThanOrEqual(32);
    }
  });
});
