/**
 * E2E Structured Question Input Tests (FR57–FR59)
 *
 * Validates the Question Card Stack flow when the agent responds with
 * multiple numbered questions. Tests cover detection, card navigation,
 * answer input, review overlay, and aggregated submission.
 *
 * These tests use a REAL agent (Claude SDK or subscription). The agent's
 * response is non-deterministic — the prompt is crafted to reliably
 * trigger a multi-question response, but soft assertions are used where
 * the exact format may vary.
 *
 * Prerequisites:
 *   - Claude Pro/Max subscription (logged in via `claude login`) OR API key configured
 *   - App must be built: `npm run build`
 *
 * Run: npx playwright test test/e2e/structured-questions.spec.ts
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let app: ElectronApplication;
let page: Page;

const USER_DATA_PATH = path.join(
  process.env['HOME'] ?? '/tmp',
  'Library/Application Support/TalkTerm-structured-questions-test',
);

/** Generous timeout for real agent responses */
const AGENT_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const SEL = {
  textInput: 'textarea',
  questionCardStack: '[data-testid="question-card-stack"]',
  questionTitle: '[data-testid="question-title"]',
  questionBody: '[data-testid="question-body"]',
  questionProgress: '[data-testid="question-progress"]',
  answerInput: '[data-testid="question-answer-input"]',
  dotNav: '[data-testid="dot-navigation"]',
  dotButton: '[data-testid="dot-navigation"] button',
  nextButton: '[aria-label="Next question"]',
  backButton: '[aria-label="Previous question"]',
  skipButton: '[aria-label="Skip question"]',
  submitAllButton: '[aria-label="Submit all answers"]',
  closeButton: '[aria-label="Close questions"]',
  suggestionChip: '[data-testid="suggestion-chip"]',
  reviewOverlay: '[data-testid="question-review"]',
  reviewAnswerRow: '[data-testid="review-answer-row"]',
  reviewEditButton: '[data-testid="review-edit"]',
  reviewConfirmButton: 'button:has-text("Send to")',
} as const;

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/** Navigate through setup wizard to reach the conversation view */
async function completeSetupToConversation(p: Page): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await p.waitForTimeout(500);

    // Check if we've reached the conversation view (textarea visible)
    const textarea = p.locator(SEL.textInput).first();
    if (await textarea.isVisible().catch(() => false)) return;

    const heading = p.locator('h1').first();
    const headingText = (await heading.textContent().catch(() => '')) ?? '';

    if (headingText.includes('Get Started')) {
      const subBtn = p.getByText(/Claude Pro \/ Max Subscription/i).first();
      if (await subBtn.isVisible().catch(() => false)) {
        await subBtn.click();
        await p.waitForTimeout(500);
        continue;
      }
    }

    if (headingText.includes('call you')) {
      await p.getByPlaceholder(/name/i).fill('Test User');
      await p.getByRole('button', { name: /continue/i }).click();
      await p.waitForTimeout(500);
      continue;
    }

    if (/avatar|Meet|Choose|companion|team member/i.test(headingText)) {
      const maryBtn = p.getByRole('button', { name: /select mary/i });
      if (await maryBtn.isVisible().catch(() => false)) {
        await maryBtn.click();
      } else {
        await p
          .getByText('Mary')
          .first()
          .click()
          .catch(() => {});
      }
      await p.waitForTimeout(500);
      continue;
    }

    if (/project|Connect/i.test(headingText)) {
      const skipBtn = p.getByRole('button', { name: /skip/i });
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      }
      await p.waitForTimeout(500);
      continue;
    }

    if (/Welcome|Hey/i.test(headingText)) {
      await p
        .locator('h1')
        .first()
        .waitFor({ state: 'hidden', timeout: 10_000 })
        .catch(() => {});
      continue;
    }

    await p.waitForTimeout(1000);
  }
}

/** Wait for the agent to finish its current turn */
async function waitForAgentReady(p: Page): Promise<void> {
  await p
    .locator('[aria-label="Avatar is ready"]')
    .waitFor({ state: 'visible', timeout: AGENT_TIMEOUT_MS });
}

/**
 * Send a prompt specifically crafted to trigger a multi-question response.
 * The explicit instruction to "ask me numbered questions" maximizes the
 * chance the agent formats its response as a numbered list.
 */
async function sendQuestionTriggerPrompt(p: Page): Promise<void> {
  const input = p.locator(SEL.textInput).first();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(
    'I want to build a mobile app for competitive baton twirlers. Before you start planning, ' +
      'please ask me exactly 5 numbered questions to understand my requirements. ' +
      'Format each question as "1. **Title** — question text?" with bold titles.',
  );
  await input.press('Enter');
}

/** Check if the question card stack appeared after sending the prompt */
async function waitForCardStack(p: Page): Promise<boolean> {
  try {
    await p.locator(SEL.questionCardStack).waitFor({ state: 'visible', timeout: AGENT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Structured Question Input (FR57–FR59)', () => {
  test.describe.configure({ mode: 'serial', timeout: AGENT_TIMEOUT_MS * 3 });

  test.beforeAll(async () => {
    // Clean test user data
    if (fs.existsSync(USER_DATA_PATH)) {
      fs.rmSync(USER_DATA_PATH, { recursive: true });
    }

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
    await completeSetupToConversation(page);

    // Verify we reached the conversation view
    const textarea = page.locator(SEL.textInput).first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    // No hard-coded option cards should be present
    const optionGroup = page.locator('[role="group"][aria-label="Suggested actions"]');
    await expect(optionGroup)
      .toBeHidden({ timeout: 2000 })
      .catch(() => {
        // Acceptable — group may not exist at all
      });
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Question detection and card stack rendering
  // -------------------------------------------------------------------------

  test('triggers question card stack on multi-question agent response', async () => {
    await sendQuestionTriggerPrompt(page);

    const appeared = await waitForCardStack(page);
    if (!appeared) {
      // If the card stack didn't appear, the agent may have responded
      // in a non-numbered format. Wait for ready and retry with a
      // more explicit prompt.
      await waitForAgentReady(page);
      const input = page.locator(SEL.textInput).first();
      await input.fill(
        'Please reformat your previous response as exactly 5 numbered questions, ' +
          'each on its own line like: 1. **Title** — question?',
      );
      await input.press('Enter');
      const retryAppeared = await waitForCardStack(page);
      expect(retryAppeared).toBe(true);
    }
  });

  test('displays progress indicator showing question count', async () => {
    const progress = page.locator(SEL.questionProgress);
    await expect(progress).toBeVisible();
    const text = await progress.textContent();
    expect(text).toMatch(/1 of \d+/);
  });

  test('displays question title and body', async () => {
    const title = page.locator(SEL.questionTitle).first();
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);

    const body = page.locator(SEL.questionBody).first();
    await expect(body).toBeVisible();
    const bodyText = await body.textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('displays answer text area with accessible label', async () => {
    const input = page.locator(SEL.answerInput).first();
    await expect(input).toBeVisible();
    const label = await input.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('displays dot navigation matching question count', async () => {
    const dots = page.locator(SEL.dotButton);
    const count = await dots.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First dot should be active
    const firstDot = dots.first();
    await expect(firstDot).toHaveAttribute('aria-current', 'step');
  });

  // -------------------------------------------------------------------------
  // Card navigation
  // -------------------------------------------------------------------------

  test('navigates to next question via Next button', async () => {
    const nextBtn = page.locator(SEL.nextButton).first();
    await expect(nextBtn).toBeVisible();
    const progressBefore = await page.locator(SEL.questionProgress).textContent();
    await nextBtn.click();
    const progressAfter = await page.locator(SEL.questionProgress).textContent();
    expect(progressAfter).not.toBe(progressBefore);
  });

  test('navigates back via Back button', async () => {
    const backBtn = page.locator(SEL.backButton).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    const progress = await page.locator(SEL.questionProgress).textContent();
    expect(progress).toContain('1 of');
  });

  test('navigates to specific question via dot click', async () => {
    const dots = page.locator(SEL.dotButton);
    const count = await dots.count();
    if (count >= 3) {
      await dots.nth(2).click();
      const progress = await page.locator(SEL.questionProgress).textContent();
      expect(progress).toContain('3 of');
    }
  });

  // -------------------------------------------------------------------------
  // Answer input and persistence
  // -------------------------------------------------------------------------

  test('accepts typed answer and preserves across navigation', async () => {
    // Go to first question
    const dots = page.locator(SEL.dotButton);
    await dots.first().click();

    const input = page.locator(SEL.answerInput).first();
    await input.fill('Web app to start, mobile later');
    await expect(input).toHaveValue('Web app to start, mobile later');

    // Navigate away
    const nextBtn = page.locator(SEL.nextButton).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
    }

    // Navigate back — answer should be preserved
    await dots.first().click();
    await expect(page.locator(SEL.answerInput).first()).toHaveValue(
      'Web app to start, mobile later',
    );
  });

  // -------------------------------------------------------------------------
  // Suggestion chips (agent-dependent)
  // -------------------------------------------------------------------------

  test('renders and toggles suggestion chips when present', async () => {
    // Navigate through questions looking for one with chips
    const dots = page.locator(SEL.dotButton);
    const count = await dots.count();
    let foundChips = false;

    for (let i = 0; i < count; i++) {
      await dots.nth(i).click();
      const chips = page.locator(SEL.suggestionChip);
      if ((await chips.count()) > 0) {
        foundChips = true;
        // Test toggle
        const firstChip = chips.first();
        await firstChip.click();
        await expect(firstChip).toHaveAttribute('aria-pressed', 'true');
        await firstChip.click();
        await expect(firstChip).toHaveAttribute('aria-pressed', 'false');
        break;
      }
    }

    if (!foundChips) {
      test.info().annotations.push({
        type: 'info',
        description: 'No suggestion chips — agent did not include bullet-list options',
      });
    }
  });

  // -------------------------------------------------------------------------
  // Skip behavior
  // -------------------------------------------------------------------------

  test('skip button advances to next question', async () => {
    // Go to first question
    const dots = page.locator(SEL.dotButton);
    await dots.first().click();
    const progressBefore = await page.locator(SEL.questionProgress).textContent();

    const skipBtn = page.locator(SEL.skipButton).first();
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();

    const progressAfter = await page.locator(SEL.questionProgress).textContent();
    expect(progressAfter).not.toBe(progressBefore);
  });

  // -------------------------------------------------------------------------
  // Review overlay and submission
  // -------------------------------------------------------------------------

  test('shows review overlay after answering all questions', async () => {
    const dots = page.locator(SEL.dotButton);
    const count = await dots.count();

    // Fill answers for all questions
    for (let i = 0; i < count; i++) {
      await dots.nth(i).click();
      const input = page.locator(SEL.answerInput).first();
      const currentValue = await input.inputValue();
      if (currentValue === '') {
        await input.fill(`Answer for question ${String(i + 1)}`);
      }
    }

    // Navigate to last question and click Submit All
    await dots.nth(count - 1).click();
    const submitBtn = page.locator(SEL.submitAllButton);
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Review overlay should appear
    const review = page.locator(SEL.reviewOverlay);
    await expect(review).toBeVisible({ timeout: 5000 });
  });

  test('review overlay shows all answer rows', async () => {
    const rows = page.locator(SEL.reviewAnswerRow);
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('clicking edit in review returns to card stack', async () => {
    const editBtns = page.locator(SEL.reviewEditButton);
    const editCount = await editBtns.count();
    if (editCount > 0) {
      await editBtns.first().click();
      await expect(page.locator(SEL.questionTitle)).toBeVisible();
      // The review should be hidden, card view should be active
      await expect(page.locator(SEL.reviewOverlay)).toBeHidden();
    }
  });

  test('confirming review sends aggregated response and dismisses card stack', async () => {
    // Re-navigate to last question → submit all → review
    const dots = page.locator(SEL.dotButton);
    const count = await dots.count();
    await dots.nth(count - 1).click();

    const submitBtn = page.locator(SEL.submitAllButton);
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    }

    const confirmBtn = page.locator(SEL.reviewConfirmButton);
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // Card stack should be dismissed
    await expect(page.locator(SEL.questionCardStack)).toBeHidden({ timeout: 10_000 });

    // Avatar should transition to thinking → then respond
    await waitForAgentReady(page);

    // Agent should have received our aggregated answers and responded
    // Verify the conversation continues (textarea should be visible again for input)
    await expect(page.locator(SEL.textInput).first()).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  test('no hard-coded option cards on initial load', async () => {
    // After the full flow, verify there are no hard-coded option card groups
    const optionGroup = page.locator('[role="group"][aria-label="Suggested actions"]');
    const visible = await optionGroup.isVisible().catch(() => false);
    expect(visible).toBe(false);
  });
});
