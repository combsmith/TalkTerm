/**
 * E2E Conversation Pattern Tests
 *
 * Validates structured conversation flows against expected behaviors.
 * Each test scenario defines a user prompt and expected response characteristics
 * (not exact text — LLM responses vary, so we validate patterns and constraints).
 *
 * Tests share a single Electron app session for speed and context accumulation.
 *
 * Uses Claude Pro/Max subscription. User must be logged in via `claude login`.
 *
 * Run: npx playwright test test/e2e/conversation-patterns.spec.ts
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
  'Library/Application Support/TalkTerm-conversation-test',
);

/** How long to wait for the agent to respond to a message */
const RESPONSE_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface ResponseExpectation {
  /** Minimum response length in characters */
  minLength?: number;
  /** Maximum response length in characters */
  maxLength?: number;
  /** At least one of these keywords/phrases must appear (case-insensitive) */
  containsAny?: string[];
  /** ALL of these keywords/phrases must appear (case-insensitive) */
  containsAll?: string[];
  /** NONE of these should appear (guards against hallucination / autonomous action) */
  excludesAll?: string[];
  /** Expected avatar state after response completes */
  finalAvatarState?: 'ready' | 'speaking';
}

interface TurnInput {
  type: 'text';
  message: string;
}

interface ConversationTurn {
  /** How the user provides input */
  input: TurnInput;
  /** What we expect from the response */
  expect: ResponseExpectation;
}

interface ConversationScenario {
  /** Scenario name — shows in test output */
  name: string;
  /** Description for documentation */
  description: string;
  /** Ordered list of conversation turns */
  turns: ConversationTurn[];
}

// ---------------------------------------------------------------------------
// Conversation scenarios
// ---------------------------------------------------------------------------

const scenarios: ConversationScenario[] = [
  // --- Text input scenarios ---

  {
    name: 'Simple greeting',
    description: 'Agent responds conversationally to a basic greeting',
    turns: [
      {
        input: { type: 'text', message: 'Hi Mary, how are you today?' },
        expect: {
          minLength: 10,
          maxLength: 500,
          containsAny: [
            'hello',
            'hi',
            'hey',
            'help',
            'assist',
            'glad',
            'great',
            'doing',
            'welcome',
          ],
          excludesAll: ['error', 'Error:', 'undefined', 'null', 'NaN'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Conversational question — no tool use',
    description: 'Agent answers a knowledge question without using tools',
    turns: [
      {
        input: { type: 'text', message: 'What are three benefits of test-driven development?' },
        expect: {
          minLength: 50,
          containsAny: ['test', 'TDD', 'benefit', 'advantage', 'quality', 'design', 'refactor'],
          excludesAll: ['Using Read', 'Using Bash', 'Using Edit', 'tool_use', 'file created'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Multi-turn context retention',
    description: 'Agent remembers context from the first turn in the second turn',
    turns: [
      {
        input: {
          type: 'text',
          message: 'I am building a mobile app for dog walkers called PawTrail.',
        },
        expect: {
          minLength: 20,
          containsAny: ['PawTrail', 'dog', 'walk', 'app', 'mobile'],
          finalAvatarState: 'ready',
        },
      },
      {
        input: { type: 'text', message: 'What features would you suggest for it?' },
        expect: {
          minLength: 50,
          containsAny: ['PawTrail', 'dog', 'walk', 'feature', 'suggest'],
          excludesAll: ['Using Read', 'Using Bash', 'file created'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Clarification instead of action',
    description: 'Agent asks a clarifying question instead of autonomously acting',
    turns: [
      {
        input: { type: 'text', message: 'Create something for my project.' },
        expect: {
          minLength: 20,
          containsAny: [
            'what',
            'which',
            'clarify',
            'more',
            'detail',
            'specific',
            'tell me',
            'kind',
            'type',
            'like',
            '?',
          ],
          excludesAll: ['Created', 'file created', 'Generated', 'Using Bash', 'Using Edit'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Refuses tool use without explicit request',
    description: 'Agent does not run commands or create files for an ambiguous request',
    turns: [
      {
        input: { type: 'text', message: 'Tell me about the files in this project.' },
        expect: {
          minLength: 20,
          excludesAll: ['Using Bash', 'Using Read', '$ ls', '$ find', 'file created', 'command'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Error messages are user-friendly',
    description: 'No stack traces, raw errors, or internal identifiers in any response',
    turns: [
      {
        input: { type: 'text', message: 'Summarize our conversation so far.' },
        expect: {
          minLength: 10,
          excludesAll: [
            'stack trace',
            'at Object.',
            'TypeError',
            'ReferenceError',
            'ENOENT',
            'undefined is not',
          ],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Concise response to simple question',
    description: 'Agent does not produce excessively long responses for simple questions',
    turns: [
      {
        input: { type: 'text', message: 'What is TypeScript?' },
        expect: {
          minLength: 30,
          maxLength: 1500,
          containsAny: ['TypeScript', 'JavaScript', 'type', 'language'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  // --- Topic-oriented scenarios (text-based) ---

  {
    name: 'Brainstorm request',
    description: 'Asking to brainstorm triggers a brainstorming-oriented response',
    turns: [
      {
        input: { type: 'text', message: 'Help me brainstorm ideas for a new product' },
        expect: {
          minLength: 30,
          containsAny: [
            'brainstorm',
            'idea',
            'explore',
            'generate',
            'what',
            'topic',
            'domain',
            'problem',
          ],
          excludesAll: ['Using Bash', 'file created'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'PRD request',
    description: 'Asking about a PRD triggers a product requirements-oriented response',
    turns: [
      {
        input: { type: 'text', message: 'Help me create a PRD for a mobile app' },
        expect: {
          minLength: 30,
          containsAny: ['PRD', 'product', 'requirement', 'document', 'feature', 'define', 'scope'],
          excludesAll: ['Using Bash', 'file created'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },

  {
    name: 'Topic then follow-up text',
    description: 'Initial request followed by typed text maintains conversational context',
    turns: [
      {
        input: { type: 'text', message: 'Help me brainstorm' },
        expect: {
          minLength: 20,
          containsAny: ['brainstorm', 'idea', 'explore', 'what', 'topic'],
          finalAvatarState: 'ready',
        },
      },
      {
        input: { type: 'text', message: 'Let us brainstorm features for a fitness tracker watch.' },
        expect: {
          minLength: 50,
          containsAny: ['fitness', 'tracker', 'watch', 'feature', 'health'],
          excludesAll: ['Using Bash', 'file created'],
          finalAvatarState: 'ready',
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Selectors for key UI elements */
const SEL = {
  captionBar: 'p.text-\\[14px\\]',
  textInput: 'textarea',
  avatarState: '[aria-label^="Avatar is"]',
  statusIndicator: '[role="status"]',
  micButton: 'button[aria-label="Start recording"], button[aria-label="Stop recording"]',
} as const;

/** Wait for caption bar to show a substantive response (not a status label) */
async function waitForResponse(p: Page): Promise<string> {
  await p.waitForFunction(
    (sel: string) => {
      const caption = document.querySelector(sel);
      if (caption === null) return false;
      const text = caption.textContent ?? '';
      return (
        text.length > 15 &&
        !text.includes('Thinking') &&
        !text.includes('Listening') &&
        !text.includes('Using ')
      );
    },
    SEL.captionBar,
    { timeout: RESPONSE_TIMEOUT_MS },
  );

  const caption = p.locator(SEL.captionBar).first();
  return (await caption.textContent()) ?? '';
}

/** Send a text message and wait for the response */
async function sendTextAndWait(p: Page, message: string): Promise<string> {
  const input = p.locator(SEL.textInput).first();
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(message);
  await input.press('Enter');

  // Wait for thinking state to appear (confirms message was sent)
  await p
    .locator(SEL.statusIndicator)
    .filter({ hasText: /Thinking/i })
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {
      // Thinking may be very brief — that's OK
    });

  return await waitForResponse(p);
}

/** Execute a turn based on input type */
async function executeTurn(p: Page, input: TurnInput): Promise<string> {
  return await sendTextAndWait(p, input.message);
}

/** Get the current avatar state from aria-label */
async function getAvatarState(p: Page): Promise<string> {
  const avatar = p.locator(SEL.avatarState).first();
  if (await avatar.isVisible().catch(() => false)) {
    const label = (await avatar.getAttribute('aria-label')) ?? '';
    return label.replace('Avatar is ', '').toLowerCase();
  }
  return 'unknown';
}

/** Navigate through setup to reach conversation view */
async function completeSetupToConversation(p: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    await p.waitForTimeout(500);
    const heading = p.locator('h1').first();
    const headingText = await heading.textContent().catch(() => '');

    // Already in conversation?
    const textarea = p.locator(SEL.textInput).first();
    if (await textarea.isVisible().catch(() => false)) return;

    // Auth choice → pick subscription
    if (headingText?.includes('Get Started')) {
      const subBtn = p.getByText(/Claude Pro \/ Max Subscription/i).first();
      if (await subBtn.isVisible().catch(() => false)) {
        await subBtn.click();
        await p.waitForTimeout(500);
        continue;
      }
    }

    // Profile
    if (headingText?.includes('call you')) {
      await p.getByPlaceholder(/name/i).fill('Test User');
      await p.getByRole('button', { name: /continue/i }).click();
      await p.waitForTimeout(500);
      continue;
    }

    // Avatar
    if (
      headingText?.includes('avatar') ||
      headingText?.includes('Meet') ||
      headingText?.includes('Choose') ||
      headingText?.includes('companion') ||
      headingText?.includes('team member')
    ) {
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

    // Workspace
    if (headingText?.includes('project') || headingText?.includes('Connect')) {
      const skipBtn = p.getByRole('button', { name: /skip/i });
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
      }
      await p.waitForTimeout(500);
      continue;
    }

    // Greeting — wait for auto-advance
    if (headingText?.includes('Welcome') || headingText?.includes('Hey')) {
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

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertResponse(
  response: string,
  expectation: ResponseExpectation,
  scenarioName: string,
  turnIndex: number,
): void {
  const ctx = `[${scenarioName} — turn ${turnIndex + 1}]`;
  const lower = response.toLowerCase();

  if (expectation.minLength !== undefined) {
    expect(
      response.length,
      `${ctx} Response too short (${response.length} < ${expectation.minLength}): "${response.slice(0, 100)}"`,
    ).toBeGreaterThanOrEqual(expectation.minLength);
  }

  if (expectation.maxLength !== undefined) {
    expect(
      response.length,
      `${ctx} Response too long (${response.length} > ${expectation.maxLength})`,
    ).toBeLessThanOrEqual(expectation.maxLength);
  }

  if (expectation.containsAny !== undefined && expectation.containsAny.length > 0) {
    const found = expectation.containsAny.some((kw) => lower.includes(kw.toLowerCase()));
    expect(
      found,
      `${ctx} Response must contain at least one of: [${expectation.containsAny.join(', ')}]\nGot: "${response.slice(0, 200)}"`,
    ).toBe(true);
  }

  if (expectation.containsAll !== undefined) {
    for (const kw of expectation.containsAll) {
      expect(
        lower,
        `${ctx} Response must contain "${kw}"\nGot: "${response.slice(0, 200)}"`,
      ).toContain(kw.toLowerCase());
    }
  }

  if (expectation.excludesAll !== undefined) {
    for (const kw of expectation.excludesAll) {
      expect(
        lower,
        `${ctx} Response must NOT contain "${kw}"\nGot: "${response.slice(0, 200)}"`,
      ).not.toContain(kw.toLowerCase());
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Conversation Patterns', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
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

    // Confirm we reached conversation view
    const textarea = page.locator(SEL.textInput).first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Audio / voice UI tests
  // -------------------------------------------------------------------------

  test.describe('Audio UI', () => {
    test('microphone button is present', async () => {
      const mic = page.locator(SEL.micButton).first();
      await expect(mic).toBeVisible({ timeout: 5000 });
    });

    test('text-to-speech triggers avatar speaking state on response', async () => {
      // Send a message and watch for the avatar to enter 'speaking' state
      // (indicates TTS was triggered for the response)
      const input = page.locator(SEL.textInput).first();
      await input.fill('Say hello briefly.');
      await input.press('Enter');

      // Wait for speaking state — TTS should trigger it
      const avatarSpeaking = page.locator('[aria-label="Avatar is speaking"]');
      const didSpeak = await avatarSpeaking
        .waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true)
        .catch(() => false);

      // Avatar should transition to speaking when TTS starts.
      // In headless/CI, Web Speech API may not be available — speaking may not trigger.
      // We treat this as a soft check: log if TTS didn't fire but don't fail.
      if (!didSpeak) {
        test.info().annotations.push({
          type: 'warning',
          description:
            'TTS did not trigger avatar speaking state — Web Speech API may be unavailable',
        });
      }

      // Wait for the response to complete regardless
      await waitForResponse(page);

      // Verify the text input remains accessible after the interaction
      await expect(page.locator(SEL.textInput).first()).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // Conversation pattern scenarios (cards + text input)
  // -------------------------------------------------------------------------

  test.describe('Scenarios', () => {
    for (const scenario of scenarios) {
      test(scenario.name, async () => {
        test.info().annotations.push({ type: 'description', description: scenario.description });

        for (let i = 0; i < scenario.turns.length; i++) {
          const turn = scenario.turns[i]!;
          const response = await executeTurn(page, turn.input);

          // Validate response content
          assertResponse(response, turn.expect, scenario.name, i);

          // Validate avatar state if specified
          if (turn.expect.finalAvatarState !== undefined) {
            await page.waitForTimeout(2000);
            const state = await getAvatarState(page);
            if (turn.expect.finalAvatarState === 'ready') {
              expect(
                ['ready', 'speaking'],
                `Expected avatar ready or speaking, got: ${state}`,
              ).toContain(state);
            }
          }

          // Brief pause between turns
          if (i < scenario.turns.length - 1) {
            await page.waitForTimeout(2000);
          }
        }
      });
    }
  });
});
