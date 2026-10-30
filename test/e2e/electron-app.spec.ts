/**
 * Real E2E tests — launches the actual Electron app and drives the full
 * setup → conversation → SDK flow.
 *
 * Uses Claude Pro/Max subscription (no API key needed).
 * The user must be logged in via `claude login` before running.
 *
 * Run: npx playwright test test/e2e/electron-app.spec.ts --config playwright.electron.config.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

let app: ElectronApplication;
let page: Page;

const USER_DATA_PATH = path.join(
  process.env['HOME'] ?? '/tmp',
  'Library/Application Support/TalkTerm-test',
);

test.beforeAll(async () => {
  // Clean test user data for fresh state
  if (fs.existsSync(USER_DATA_PATH)) {
    fs.rmSync(USER_DATA_PATH, { recursive: true });
  }

  // No API key needed — uses Claude Pro subscription via forceLoginMethod: 'claudeai'
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

/** Detect current screen by heading text.
 * Uses a short 500ms wait as a polling delay — this helper is called in a loop
 * and needs a brief pause to let the UI settle between iterations. There is no
 * single DOM event to await here since we are sniffing multiple possible screens. */
async function getCurrentScreen(p: Page): Promise<string> {
  await p.waitForTimeout(500);
  const heading = p.locator('h1').first();
  if (await heading.isVisible().catch(() => false)) {
    const text = (await heading.textContent()) ?? '';
    if (text.includes('Get Started')) return 'auth-choice';
    if (text.includes('Enter API Key')) return 'api-key';
    if (text.includes('call you')) return 'profile';
    if (
      text.includes('avatar') ||
      text.includes('companion') ||
      text.includes('Meet') ||
      text.includes('team member') ||
      text.includes('Choose')
    )
      return 'avatar';
    if (text.includes('project') || text.includes('Connect')) return 'workspace';
    if (text.includes('Loading') || text.includes('Welcome')) return 'greeting';
  }
  // Check for conversation view — has the text input
  const input = p.locator('textarea, input[type="text"]').first();
  if (await input.isVisible().catch(() => false)) {
    const placeholder = (await input.getAttribute('placeholder')) ?? '';
    if (placeholder.toLowerCase().includes('type') || placeholder.toLowerCase().includes('speak')) {
      return 'conversation';
    }
  }
  // Check for loading state
  const body = (await p.textContent('body')) ?? '';
  if (body.includes('Starting TalkTerm') || body.includes('Loading')) return 'loading';
  return 'unknown';
}

/** Navigate through all setup screens until conversation view */
async function completeSetupFlow(p: Page): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const screen = await getCurrentScreen(p);

    if (screen === 'conversation') return;
    if (screen === 'greeting') {
      await p
        .locator('h1')
        .first()
        .waitFor({ state: 'hidden', timeout: 10000 })
        .catch(() => {});
      continue;
    }
    if (screen === 'loading') {
      await p
        .waitForFunction(
          () => {
            const body = document.body.textContent ?? '';
            return !body.includes('Starting TalkTerm') && !body.includes('Loading');
          },
          { timeout: 10000 },
        )
        .catch(() => {});
      continue;
    }

    if (screen === 'auth-choice') {
      // Select Claude Pro/Max subscription — no API key needed
      const subscriptionBtn = p.getByText(/Claude Pro \/ Max Subscription/i).first();
      if (await subscriptionBtn.isVisible().catch(() => false)) {
        await subscriptionBtn.click();
      }
      await p
        .locator('h1')
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {});
      continue;
    }

    if (screen === 'api-key') {
      // Shouldn't reach here in subscription mode, but handle gracefully
      const backBtn = p.getByText('Back');
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
      }
      continue;
    }

    if (screen === 'profile') {
      const nameInput = p.getByPlaceholder(/name/i);
      await nameInput.fill('E2E Tester');
      await p.getByRole('button', { name: /continue/i }).click();
      await nameInput.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      continue;
    }

    if (screen === 'avatar') {
      const maryBtn = p.getByRole('button', { name: /select mary/i });
      if (await maryBtn.isVisible().catch(() => false)) {
        await maryBtn.click();
      } else {
        const maryText = p.getByText('Mary').first();
        if (await maryText.isVisible().catch(() => false)) {
          await maryText.click();
        }
      }
      await p
        .locator('h1')
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {});
      continue;
    }

    if (screen === 'workspace') {
      const skipBtn = p.getByRole('button', { name: /skip/i });
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      }
      await skipBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      continue;
    }

    await p
      .waitForFunction(() => document.querySelector('h1')?.textContent, { timeout: 3000 })
      .catch(() => {});
  }
}

test.describe('Full App Flow: Setup → Conversation → SDK', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. Navigate through setup to conversation view', async () => {
    await completeSetupFlow(page);
    await page.screenshot({ path: 'test-results/01-conversation.png' });

    const screen = await getCurrentScreen(page);
    expect(screen).toBe('conversation');
  });

  test('2. Verify conversation view has text input and avatar', async () => {
    const input = page.locator('textarea, input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });

    const body = (await page.textContent('body')) ?? '';
    expect(body.length).toBeGreaterThan(20);

    await page.screenshot({ path: 'test-results/02-conversation-ready.png' });
  });

  test('3. Send prompt and receive SDK response', async () => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('A new app idea for Baton Twirlers to find and register for events.');
    await input.press('Enter');

    await page.screenshot({ path: 'test-results/03-sent-prompt.png' });

    // Wait for SDK response — the avatar transitions through thinking → speaking/ready.
    await page
      .locator('[role="status"]')
      .filter({ hasText: /Thinking/i })
      .waitFor({
        state: 'visible',
        timeout: 10000,
      })
      .catch(() => {});
    await page.screenshot({ path: 'test-results/04-thinking.png' });

    // Wait for the response to arrive — caption bar shows response text
    await page.waitForFunction(
      () => {
        const caption = document.querySelector('p.text-\\[14px\\]');
        if (caption === null) return false;
        const text = caption.textContent ?? '';
        return text.length > 30 && !text.includes('Thinking') && !text.includes('Listening');
      },
      { timeout: 30000 },
    );
    await page.screenshot({ path: 'test-results/05-response.png' });

    const captionText = await page.locator('p.text-\\[14px\\]').first().textContent();
    expect(captionText).toBeTruthy();
  });
});
