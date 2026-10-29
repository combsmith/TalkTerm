/**
 * E2E tests for error recovery flows — invalid API key handling,
 * graceful degradation without credentials, and user-friendly error messages.
 *
 * These tests do NOT require a real ANTHROPIC_API_KEY.
 * Run: npx playwright test test/e2e/error-recovery.spec.ts --config playwright.config.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

let app: ElectronApplication;
let page: Page;

const USER_DATA_PATH = path.join(
  process.env['HOME'] ?? '/tmp',
  'Library/Application Support/TalkTerm-error-recovery-test',
);

test.beforeAll(async () => {
  if (fs.existsSync(USER_DATA_PATH)) {
    fs.rmSync(USER_DATA_PATH, { recursive: true });
  }
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test.describe('Error Recovery Flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. App launches to API key setup without ANTHROPIC_API_KEY', async () => {
    const env = { ...process.env, ELECTRON_USER_DATA_DIR: USER_DATA_PATH } as Record<
      string,
      string
    >;
    delete (env as Record<string, string | undefined>)['ANTHROPIC_API_KEY'];

    app = await electron.launch({
      args: ['--no-sandbox', path.join(__dirname, '../../.vite/build/main.cjs')],
      env,
    });

    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Should route to the auth choice screen with "Get Started" heading, then API key entry
    const heading = page.locator('h1');
    await expect(heading).toContainText('Get Started', { timeout: 15000 });

    const apiKeyOption = page.getByRole('button', { name: /anthropic api key/i });
    if (await apiKeyOption.isVisible().catch(() => false)) {
      await apiKeyOption.click();
    }

    // The password input for the API key should be visible and focusable
    const input = page.locator('input[type="password"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(input).toBeFocused();
  });

  test('2. Invalid API key shows error and allows retry', async () => {
    const input = page.locator('input[type="password"]');
    await input.fill('sk-ant-invalid-key');

    const validateBtn = page.getByRole('button', { name: /validate/i });
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();

    // Wait for the error message to appear
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });

    // Error message should be user-friendly
    const errorText = await errorMsg.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(10);

    // The validate button should still be available for retry (clear input first)
    await input.clear();
    await input.fill('sk-ant-another-bad-key');
    await expect(validateBtn).toBeVisible();
    await expect(validateBtn).toBeEnabled();
  });

  test('3. Error messages are user-friendly (no stack traces)', async () => {
    // Submit another invalid key to trigger error state
    const input = page.locator('input[type="password"]');
    await input.clear();
    await input.fill('sk-ant-bogus-test-key');

    const validateBtn = page.getByRole('button', { name: /validate/i });
    await validateBtn.click();

    // Wait for the error to appear
    const errorMsg = page.locator('p.text-danger');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });

    // Grab full page text for inspection
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Must NOT contain raw error type prefixes
    expect(bodyText).not.toMatch(/TypeError:/);
    expect(bodyText).not.toMatch(/ReferenceError:/);
    expect(bodyText).not.toMatch(/SyntaxError:/);

    // Must NOT contain stack trace patterns (file:line:col)
    expect(bodyText).not.toMatch(/at Object\.<anonymous>/);
    expect(bodyText).not.toMatch(/\.(ts|js|tsx|jsx):\d+:\d+/);

    // Must NOT contain raw JSON error objects
    expect(bodyText).not.toMatch(/"error"\s*:\s*\{/);
    expect(bodyText).not.toMatch(/"stack"\s*:\s*"/);

    await page.screenshot({ path: 'test-results/error-recovery-friendly-msg.png' });
  });
});
