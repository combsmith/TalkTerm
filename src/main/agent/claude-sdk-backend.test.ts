/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent } from '../../shared/types/domain/agent-event';
import type { AuditRepository } from '../../shared/types/ports/audit-repository';
import { ClaudeSdkBackend } from './claude-sdk-backend';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
}));

function createMockAuditRepo(): AuditRepository {
  return {
    append: vi.fn(),
    findBySession: vi.fn().mockReturnValue([]),
    findByDateRange: vi.fn().mockReturnValue([]),
  };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

/**
 * Create an async generator that yields the given SDK messages.
 * Mimics the SDK's query() return type.
 */
function createMockSdkQuery(
  messages: Array<Record<string, unknown>>,
): AsyncGenerator<Record<string, unknown>, void> & { interrupt: () => Promise<void> } {
  // eslint-disable-next-line @typescript-eslint/require-await -- yields synchronously from array
  async function* gen(): AsyncGenerator<Record<string, unknown>, void> {
    for (const msg of messages) {
      yield msg;
    }
  }
  const generator = gen() as AsyncGenerator<Record<string, unknown>, void> & {
    interrupt: () => Promise<void>;
  };
  generator.interrupt = vi.fn().mockResolvedValue(undefined);
  return generator;
}

/**
 * Mock the SDK module. Returns a spy on query() so tests can assert
 * that the SDK was actually called with correct parameters.
 */
function mockSdkModule(messages: Array<Record<string, unknown>>): {
  query: ReturnType<typeof vi.fn>;
} {
  const querySpy = vi.fn().mockImplementation(() => createMockSdkQuery(messages));
  return { query: querySpy };
}

/**
 * Install the SDK mock so dynamic import('@anthropic-ai/claude-agent-sdk') resolves it.
 */
function installSdkMock(sdkMock: { query: ReturnType<typeof vi.fn> }): void {
  vi.doMock('@anthropic-ai/claude-agent-sdk', () => sdkMock);
}

function clearSdkMock(): void {
  vi.doUnmock('@anthropic-ai/claude-agent-sdk');
}

describe('ClaudeSdkBackend', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    clearSdkMock();
    // Reset fs mock to reject by default (no BMAD files)
    const fsMock = await import('node:fs/promises');
    vi.mocked(fsMock.readFile).mockRejectedValue(new Error('ENOENT'));
  });

  describe('startSession', () => {
    it('yields error when no API key is provided', async () => {
      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => null);
      const events = await collectEvents(
        backend.startSession({ workspacePath: '/tmp', apiKey: '' }),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('error');
      if (events[0]?.type === 'error') {
        expect(events[0].recoveryOptions[0]?.action).toBe('setup-key');
      }
    });

    it('calls SDK query() with correct options when API key is present', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello from Claude!' }] },
          session_id: 'sess-1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Session started',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-1',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(
        backend.startSession({ workspacePath: '/tmp/project', apiKey: 'sk-ant-test-key' }),
      );

      // SDK query() was called
      expect(sdkMock.query).toHaveBeenCalledTimes(1);
      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: Record<string, unknown> },
      ];
      expect(callArgs[0].options).toMatchObject({
        cwd: '/tmp/project',
        persistSession: true,
      });
      expect(callArgs[0].options.env).toMatchObject({
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      });

      // Events were mapped correctly
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(1);
      if (textEvents[0]?.type === 'text') {
        expect(textEvents[0].content).toBe('Hello from Claude!');
      }

      const completeEvents = events.filter((e) => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
    });

    it('yields demo mode message when SDK is not installed', async () => {
      clearSdkMock();
      // Force SDK to be unavailable by mocking the import to throw
      vi.doMock('@anthropic-ai/claude-agent-sdk', () => {
        throw new Error('Cannot find module');
      });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test');
      const events = await collectEvents(
        backend.startSession({ workspacePath: '/tmp', apiKey: 'sk-ant-test' }),
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
      const textEvent = events.find((e) => e.type === 'text');
      expect(textEvent?.type).toBe('text');
      if (textEvent?.type === 'text') {
        expect(textEvent.content).toContain('demo mode');
      }
    });
  });

  describe('sendMessage', () => {
    it('calls SDK query() and maps assistant text response', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Here is my response about your code.' }],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.002,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const auditRepo = createMockAuditRepo();
      const backend = new ClaudeSdkBackend(auditRepo, () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'explain this function'));

      // SDK was called with the user's message as prompt
      expect(sdkMock.query).toHaveBeenCalledTimes(1);
      const callArgs = sdkMock.query.mock.calls[0] as [{ prompt: string }];
      expect(callArgs[0].prompt).toBe('explain this function');

      // Text event was yielded
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(1);
      if (textEvents[0]?.type === 'text') {
        expect(textEvents[0].content).toBe('Here is my response about your code.');
      }

      // Audit was logged for user message
      expect(auditRepo.append).toHaveBeenCalled();
    });

    it('passes workspace path as cwd to SDK query', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-42', 'hello', '/home/user/project'));

      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: Record<string, unknown> },
      ];
      expect(callArgs[0].options).toMatchObject({ cwd: '/home/user/project' });
    });

    it('maps tool_use content blocks to tool-call events', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'Read',
                input: { file_path: '/src/main.ts' },
              },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'read the main file'));

      const toolEvents = events.filter((e) => e.type === 'tool-call');
      expect(toolEvents).toHaveLength(1);
      if (toolEvents[0]?.type === 'tool-call') {
        expect(toolEvents[0].toolName).toBe('Read');
        expect(toolEvents[0].toolInput).toEqual({ file_path: '/src/main.ts' });
      }
    });

    it('maps tool_progress SDK messages to progress events', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'tool_progress',
          tool_name: 'Bash',
          tool_use_id: 'tu-2',
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'run tests'));

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toHaveLength(1);
      if (progressEvents[0]?.type === 'progress') {
        expect(progressEvents[0].step).toContain('Bash');
        expect(progressEvents[0].status).toBe('in-progress');
      }
    });

    it('maps tool_use_summary SDK messages to completed progress events', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'tool_use_summary',
          summary: 'Read 3 files',
          preceding_tool_use_ids: ['tu-1', 'tu-2', 'tu-3'],
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'explore codebase'));

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toHaveLength(1);
      if (progressEvents[0]?.type === 'progress') {
        expect(progressEvents[0].step).toBe('Read 3 files');
        expect(progressEvents[0].status).toBe('completed');
      }
    });

    it('retries 3 times then yields error on persistent SDK result error', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'result',
          subtype: 'error_max_turns',
          errors: ['Max turns exceeded'],
          is_error: true,
          duration_ms: 5000,
          num_turns: 10,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'do something'));

      // 3 retry progress events + 1 final error
      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toHaveLength(3);

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      if (errorEvents[0]?.type === 'error') {
        expect(errorEvents[0].recoveryOptions).toHaveLength(1);
        expect(errorEvents[0].recoveryOptions[0]?.description).not.toContain('Max turns exceeded');
        expect(errorEvents[0].recoveryOptions[0]?.description).toBeTruthy();
      }

      // SDK called 4 times total (1 initial + 3 retries)
      expect(sdkMock.query).toHaveBeenCalledTimes(4);
    });

    it('retries 3 times then yields error on persistent assistant error', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [] },
          error: 'authentication_failed',
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(sdkMock.query).toHaveBeenCalledTimes(4);
    });

    it('retries 3 times then yields error when SDK stream throws', async () => {
      const querySpy = vi.fn().mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/require-await -- throws synchronously
        async function* gen(): AsyncGenerator<Record<string, unknown>, void> {
          throw new Error('network connection lost');
        }
        const g = gen() as AsyncGenerator<Record<string, unknown>, void> & {
          interrupt: () => Promise<void>;
        };
        g.interrupt = vi.fn().mockResolvedValue(undefined);
        return g;
      });
      installSdkMock({ query: querySpy });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      if (errorEvents[0]?.type === 'error') {
        expect(errorEvents[0].userMessage).toBeTruthy();
        expect(errorEvents[0].recoveryOptions.length).toBeGreaterThan(0);
      }
      expect(querySpy).toHaveBeenCalledTimes(4);
    });

    it('yields error when no API key for sendMessage', async () => {
      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => null);
      const events = await collectEvents(backend.sendMessage('sess-1', 'hello'));

      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
  });

  describe('cancelCurrentAction', () => {
    it('can be cancelled without throwing', () => {
      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test');
      expect(() => {
        backend.cancelCurrentAction();
      }).not.toThrow();
    });

    it('terminates turn without retrying when cancelled and SDK stream throws', async () => {
      let backendRef: ClaudeSdkBackend | null = null;
      const querySpy = vi.fn().mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/require-await -- cancels and throws
        async function* gen(): AsyncGenerator<Record<string, unknown>, void> {
          backendRef?.cancelCurrentAction();
          throw new Error('Request aborted by user');
        }
        const g = gen() as AsyncGenerator<Record<string, unknown>, void> & {
          interrupt: () => Promise<void>;
        };
        g.interrupt = vi.fn().mockResolvedValue(undefined);
        return g;
      });
      installSdkMock({ query: querySpy });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      backendRef = backend;
      const events = await collectEvents(backend.sendMessage('sess-cancel', 'long task'));

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(events).toEqual([{ type: 'complete', summary: 'Cancelled by user' }]);
    });
  });

  describe('resumeSession', () => {
    it('yields events from resumeSession', async () => {
      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test');
      const events = await collectEvents(backend.resumeSession('sess-1'));
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]?.type).toBe('text');
    });

    it('persists SDK session_id and restores conversation on resume across restarts', async () => {
      const persistedIds = new Map<string, string>();
      const onSdkSessionId = vi.fn((sessionId: string, sdkId: string) => {
        persistedIds.set(sessionId, sdkId);
      });
      const getSdkSessionId = vi.fn((sessionId: string) => persistedIds.get(sessionId) ?? null);

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'First turn response' }] },
          session_id: 'sdk-conv-99',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sdk-conv-99',
        },
      ]);
      installSdkMock(sdkMock);

      // Process 1: initial turn records SDK session ID
      const backend1 = new ClaudeSdkBackend(
        createMockAuditRepo(),
        () => 'sk-ant-test',
        () => 'api-key',
        () => 'User',
        () => null,
        onSdkSessionId,
        getSdkSessionId,
      );
      await collectEvents(backend1.sendMessage('app-sess-1', 'hello'));
      expect(onSdkSessionId).toHaveBeenCalledWith('app-sess-1', 'sdk-conv-99');

      // Process 2 (simulated restart with fresh backend instance): resume and send next message
      const backend2 = new ClaudeSdkBackend(
        createMockAuditRepo(),
        () => 'sk-ant-test',
        () => 'api-key',
        () => 'User',
        () => null,
        onSdkSessionId,
        getSdkSessionId,
      );
      const resumeEvents = await collectEvents(backend2.resumeSession('app-sess-1'));
      expect(resumeEvents[0]?.type).toBe('text');
      if (resumeEvents[0]?.type === 'text') {
        expect(resumeEvents[0].content).toContain('previous messages');
      }

      await collectEvents(backend2.sendMessage('app-sess-1', 'follow up'));
      const secondCall = sdkMock.query.mock.calls[1] as [
        { options: { continue?: boolean; resume?: string } },
      ];
      expect(secondCall[0].options.continue).toBe(true);
      expect(secondCall[0].options.resume).toBe('sdk-conv-99');
    });

    it('preserves continue and resume on transient retry and drops them only on confirmed resume failure', async () => {
      let attemptCount = 0;
      const querySpy = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          // Turn 1 succeeds and establishes SDK session ID
          return createMockSdkQuery([
            {
              type: 'assistant',
              message: { content: [{ type: 'text', text: 'Options: 1 or 2' }] },
              session_id: 'sdk-conv-keep',
            },
            {
              type: 'result',
              subtype: 'success',
              result: 'Done',
              total_cost_usd: 0.001,
              num_turns: 1,
              session_id: 'sdk-conv-keep',
            },
          ]);
        }
        if (attemptCount === 2) {
          // Turn 2 attempt 1 fails with transient timeout
          // eslint-disable-next-line @typescript-eslint/require-await
          async function* transientFail(): AsyncGenerator<Record<string, unknown>, void> {
            throw new Error('Request timed out');
          }
          const g = transientFail() as AsyncGenerator<Record<string, unknown>, void> & {
            interrupt: () => Promise<void>;
          };
          g.interrupt = vi.fn().mockResolvedValue(undefined);
          return g;
        }
        if (attemptCount === 3) {
          // Turn 2 attempt 2 fails with confirmed session resume error
          return createMockSdkQuery([
            {
              type: 'result',
              subtype: 'error_during_execution',
              errors: ['No conversation found to resume: sdk-conv-keep'],
              session_id: 'sdk-conv-keep',
            },
          ]);
        }
        // Turn 2 attempt 3 succeeds after dropping broken resume
        return createMockSdkQuery([
          {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Recovered' }] },
            session_id: 'sdk-conv-new',
          },
          {
            type: 'result',
            subtype: 'success',
            result: 'Done',
            total_cost_usd: 0.001,
            num_turns: 1,
            session_id: 'sdk-conv-new',
          },
        ]);
      });
      installSdkMock({ query: querySpy });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test');
      await collectEvents(backend.sendMessage('app-sess-keep', 'give me options'));
      await collectEvents(backend.sendMessage('app-sess-keep', 'use option 2'));

      // Call index 1: Turn 2 initial attempt -> continue: true, resume: 'sdk-conv-keep'
      const turn2Attempt1 = querySpy.mock.calls[1] as [
        { options: { continue?: boolean; resume?: string } },
      ];
      expect(turn2Attempt1[0].options.continue).toBe(true);
      expect(turn2Attempt1[0].options.resume).toBe('sdk-conv-keep');

      // Call index 2: Turn 2 retry after transient timeout -> preserves continue: true and resume: 'sdk-conv-keep'
      const turn2Attempt2 = querySpy.mock.calls[2] as [
        { options: { continue?: boolean; resume?: string } },
      ];
      expect(turn2Attempt2[0].options.continue).toBe(true);
      expect(turn2Attempt2[0].options.resume).toBe('sdk-conv-keep');

      // Call index 3: Turn 2 retry after confirmed resume error -> drops continue and resume
      const turn2Attempt3 = querySpy.mock.calls[3] as [
        { options: { continue?: boolean; resume?: string } },
      ];
      expect(turn2Attempt3[0].options.continue).toBe(false);
      expect(turn2Attempt3[0].options.resume).toBeUndefined();
    });
  });

  describe('SDK message filtering', () => {
    it('silently ignores system init and status messages', async () => {
      const sdkMock = mockSdkModule([
        { type: 'system', subtype: 'init', session_id: 'sess-42' },
        { type: 'system', subtype: 'status', session_id: 'sess-42' },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'The actual response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      // Only text + complete, no system events leaked
      const types = events.map((e) => e.type);
      expect(types).not.toContain('system');
      expect(types).toContain('text');
      expect(types).toContain('complete');
    });

    it('skips empty text blocks', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '' },
              { type: 'text', text: '   ' },
              { type: 'text', text: 'Actual content' },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(1);
      if (textEvents[0]?.type === 'text') {
        expect(textEvents[0].content).toBe('Actual content');
      }
    });

    it('maps thinking blocks to thinking events', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'thinking',
                thinking:
                  'Let me consider the implications of this request carefully before responding to the user',
              },
              { type: 'text', text: 'Here is my answer' },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const thinkingEvents = events.filter((e) => e.type === 'thinking');
      expect(thinkingEvents).toHaveLength(1);
      if (thinkingEvents[0]?.type === 'thinking') {
        expect(thinkingEvents[0].summary).toContain('Let me consider');
      }
    });

    it('truncates long thinking blocks to 100 chars', async () => {
      const longThinking = 'A'.repeat(200);
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'thinking', thinking: longThinking }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const thinkingEvent = events.find((e) => e.type === 'thinking');
      expect(thinkingEvent).toBeDefined();
      if (thinkingEvent?.type === 'thinking') {
        expect(thinkingEvent.summary).toHaveLength(103); // 100 + '...'
      }
    });

    it('maps tool_result blocks to progress events', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tu-1',
                content: 'file.txt contents here',
                is_error: false,
              },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('maps result error_max_turns to specific message', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'result',
          subtype: 'error_max_turns',
          errors: ['max turns'],
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'error') {
        expect(errorEvent.userMessage).toContain('maximum number of steps');
      }
    });

    it('maps result error_max_budget_usd to specific message', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'result',
          subtype: 'error_max_budget_usd',
          errors: ['budget exceeded'],
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'error') {
        expect(errorEvent.userMessage).toContain('cost budget');
      }
    });

    it('maps auth_status to auth-status event', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'auth_status',
          isAuthenticating: true,
          output: ['Opening browser for login...'],
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const authEvent = events.find((e) => e.type === 'auth-status');
      expect(authEvent).toBeDefined();
      if (authEvent?.type === 'auth-status') {
        expect(authEvent.message).toBe('Opening browser for login...');
      }
    });

    it('maps prompt_suggestion to suggestion event', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
          session_id: 'sess-42',
        },
        {
          type: 'prompt_suggestion',
          suggestion: 'Tell me more about your project',
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const sugEvent = events.find((e) => e.type === 'suggestion');
      expect(sugEvent).toBeDefined();
      if (sugEvent?.type === 'suggestion') {
        expect(sugEvent.suggestions).toEqual(['Tell me more about your project']);
      }
    });

    it('maps task_started with description instead of generic text', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'system',
          subtype: 'task_started',
          task_id: 't1',
          description: 'Running test suite',
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const progressEvent = events.find(
        (e) => e.type === 'progress' && e.step === 'Running test suite',
      );
      expect(progressEvent).toBeDefined();
    });

    it('maps task_notification completed to complete event with summary', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 't1',
          status: 'completed',
          summary: 'All tests passed',
          output_file: '/tmp/out',
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
      if (completeEvent?.type === 'complete') {
        expect(completeEvent.summary).toBe('All tests passed');
      }
    });

    it('maps task_notification failed to error event', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 't1',
          status: 'failed',
          summary: 'Build failed',
          output_file: '/tmp/out',
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'error') {
        expect(errorEvent.userMessage).toBe('Build failed');
      }
    });

    it('maps task_progress with last_tool_name to tool-call event', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'system',
          subtype: 'task_progress',
          task_id: 't1',
          description: 'working',
          last_tool_name: 'Bash',
          usage: { total_tokens: 100, tool_uses: 2, duration_ms: 5000 },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const toolCallEvent = events.find((e) => e.type === 'tool-call');
      expect(toolCallEvent).toBeDefined();
      if (toolCallEvent?.type === 'tool-call') {
        expect(toolCallEvent.toolName).toBe('Bash');
      }
    });

    it('maps edge-case SDK messages: rate_limit_event, api_retry, tool_result variants, empty auth_status, and fallback system messages', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'auth_status',
          isAuthenticating: false,
          output: [],
          session_id: 'sess-42',
        },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tu-err',
                content: 'E'.repeat(100),
                is_error: true,
              },
              {
                type: 'tool_result',
                tool_use_id: 'tu-empty',
                content: '   ',
              },
              {
                type: 'unknown_block' as 'text',
                text: 'ignored',
              },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'rate_limit_event',
          session_id: 'sess-42',
        },
        {
          type: 'user',
          session_id: 'sess-42',
        },
        {
          type: 'system',
          subtype: 'task_started',
          task_id: 't-no-desc',
          session_id: 'sess-42',
        },
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 't-default-complete',
          session_id: 'sess-42',
        },
        {
          type: 'system',
          subtype: 'task_notification',
          task_id: 't-default-fail',
          status: 'failed',
          session_id: 'sess-42',
        },
        {
          type: 'system',
          subtype: 'api_retry',
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: '',
          total_cost_usd: 0,
          num_turns: 1,
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'error_during_execution',
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      expect(events.some((e) => e.type === 'progress' && e.status === 'failed')).toBe(true);
      expect(
        events.some((e) => e.type === 'progress' && e.step === 'Waiting for API availability...'),
      ).toBe(true);
      expect(events.some((e) => e.type === 'progress' && e.step === 'Processing...')).toBe(true);
      expect(events.some((e) => e.type === 'complete' && e.summary === 'Task completed')).toBe(
        true,
      );
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });
  });

  describe('BMAD context loading', () => {
    it('includes BMAD agent definition in system prompt when files exist', async () => {
      const fsMock = await import('node:fs/promises');
      const readFileMock = vi.mocked(fsMock.readFile);
      readFileMock.mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('analyst.md')) {
          return Promise.resolve('# BMAD Analyst Agent\nYou are Mary.');
        }
        if (p.includes('config.yaml')) {
          return Promise.resolve('user_name: Root\nproject_name: TestProject');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
          session_id: 'sess-1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-1',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-1', 'hello', '/workspace'));

      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: { systemPrompt: { append: string } } },
      ];
      const appendPrompt = callArgs[0].options.systemPrompt.append;
      expect(appendPrompt).toContain('<bmad-agent-definition>');
      expect(appendPrompt).toContain('BMAD Analyst Agent');
      expect(appendPrompt).toContain('<bmad-config>');
      expect(appendPrompt).toContain('user_name: User');
    });

    it('falls back to generic prompt when no BMAD files exist', async () => {
      const fsMock = await import('node:fs/promises');
      vi.mocked(fsMock.readFile).mockRejectedValue(new Error('ENOENT'));

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
          session_id: 'sess-1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-1',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-1', 'hello', '/workspace'));

      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: { systemPrompt: { append: string } } },
      ];
      const appendPrompt = callArgs[0].options.systemPrompt.append;
      expect(appendPrompt).not.toContain('<bmad-agent-definition>');
      expect(appendPrompt).toContain('loading a predefined agent');
    });

    it('falls back to process.cwd() when workspace has no BMAD files', async () => {
      const fsMock = await import('node:fs/promises');
      const readFileMock = vi.mocked(fsMock.readFile);
      // Workspace has no BMAD, but app root (process.cwd()) does
      readFileMock.mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.startsWith('/no-bmad-here')) {
          return Promise.reject(new Error('ENOENT'));
        }
        if (p.includes('analyst.md')) {
          return Promise.resolve('# App Root Analyst');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const context = await backend.loadBmadContext('/no-bmad-here');
      expect(context).not.toBeNull();
      expect(context).toContain('App Root Analyst');
    });

    it('replaces {project-root} placeholder with resolved path', async () => {
      const fsMock = await import('node:fs/promises');
      vi.mocked(fsMock.readFile).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.includes('analyst.md')) {
          return Promise.resolve('Load from {project-root}/_bmad/bmm/config.yaml');
        }
        if (p.includes('config.yaml')) {
          return Promise.resolve('output_folder: {project-root}/_bmad-output');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const context = await backend.loadBmadContext('/my/workspace');
      expect(context).not.toBeNull();
      expect(context).toContain('/my/workspace/_bmad/bmm/config.yaml');
      expect(context).toContain('/my/workspace/_bmad-output');
      expect(context).not.toContain('{project-root}');
    });
  });

  describe('debug logging', () => {
    it('does not log SDK debug output by default when TALKTERM_DEBUG_SDK is unset', async () => {
      delete process.env['TALKTERM_DEBUG_SDK'];
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const debugCalls = consoleSpy.mock.calls
        .filter((call): call is [string, ...unknown[]] => typeof call[0] === 'string')
        .filter((call) => call[0].includes('[SDK Debug]'));
      expect(debugCalls).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it('logs SDK query params to console when TALKTERM_DEBUG_SDK is enabled', async () => {
      process.env['TALKTERM_DEBUG_SDK'] = '1';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const debugCalls = consoleSpy.mock.calls
        .filter((call): call is [string, ...unknown[]] => typeof call[0] === 'string')
        .filter((call) => call[0].includes('[SDK Debug]'));
      expect(debugCalls.length).toBeGreaterThan(0);

      // Should log the query params
      const queryLog = debugCalls.find((call) => call[0].includes('sendMessage query()'));
      expect(queryLog).toBeDefined();

      // Should redact env and prompt
      const logContent = queryLog?.[1] as string;
      expect(logContent).toContain('[redacted]');
      expect(logContent).not.toContain('sk-ant-test-key');

      consoleSpy.mockRestore();
      delete process.env['TALKTERM_DEBUG_SDK'];
    });

    it('logs SDK messages and mapped UI events when TALKTERM_DEBUG_SDK is enabled', async () => {
      process.env['TALKTERM_DEBUG_SDK'] = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-42', 'hello'));

      const debugCalls = consoleSpy.mock.calls
        .filter((call): call is [string, ...unknown[]] => typeof call[0] === 'string')
        .filter((call) => call[0].includes('[SDK Debug]'));

      // Should log incoming SDK messages
      const incomingLogs = debugCalls.filter((call) => call[0].includes('←'));
      expect(incomingLogs.length).toBeGreaterThan(0);

      // Should log outgoing UI events
      const outgoingLogs = debugCalls.filter((call) => call[0].includes('→ UI event'));
      expect(outgoingLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
      delete process.env['TALKTERM_DEBUG_SDK'];
    });

    it('emits confirm-request for write/execute tools, enables acceptEdits on approved turns, and skips retry after tool activity', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'tu-write',
                name: 'Write',
                input: { file_path: '/src/app.ts' },
              },
            ],
          },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['Failed after tool'],
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'create app.ts'));

      // Should emit confirm-request for Write tool
      expect(events.some((e) => e.type === 'confirm-request' && e.action === 'Write')).toBe(true);
      // Should NOT retry because tool activity already occurred
      expect(sdkMock.query).toHaveBeenCalledTimes(1);

      // Approved turn should enable acceptEdits
      await collectEvents(backend.sendMessage('sess-42', 'approved'));
      const approvedCall = sdkMock.query.mock.calls[1] as [{ options: { permissionMode: string } }];
      expect(approvedCall[0].options.permissionMode).toBe('acceptEdits');
    });
  });

  describe('conversation history tracking', () => {
    it('tracks multi-turn conversation history', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response 1' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(createMockAuditRepo(), () => 'sk-ant-test-key');

      // First turn
      await collectEvents(backend.sendMessage('sess-42', 'first message'));
      // Second turn
      await collectEvents(backend.sendMessage('sess-42', 'second message'));

      // SDK was called twice
      expect(sdkMock.query).toHaveBeenCalledTimes(2);

      // Resume should reflect the history
      const resumeEvents = await collectEvents(backend.resumeSession('sess-42'));
      if (resumeEvents[0]?.type === 'text') {
        expect(resumeEvents[0].content).toContain('previous messages');
      }
    });
  });

  describe('audit logging', () => {
    it('logs user message and assistant response to audit repo', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Audited response' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const auditRepo = createMockAuditRepo();
      const backend = new ClaudeSdkBackend(auditRepo, () => 'sk-ant-test-key');
      await collectEvents(backend.sendMessage('sess-42', 'hello'));

      // At least user:message and agent:response
      expect(auditRepo.append).toHaveBeenCalledTimes(2);
    });

    it('continues even when audit repo throws', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Still works' }] },
          session_id: 'sess-42',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-42',
        },
      ]);
      installSdkMock(sdkMock);

      const auditRepo = createMockAuditRepo();
      (auditRepo.append as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('DB write failed');
      });

      const backend = new ClaudeSdkBackend(auditRepo, () => 'sk-ant-test-key');
      const events = await collectEvents(backend.sendMessage('sess-42', 'hello'));

      // Should still get response despite audit failure
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(1);
    });
  });

  // Story 3.5 — Cross-session memory for greeting personalization
  describe('memory context', () => {
    it('includes memory context in system prompt when getMemoryContext returns data', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Welcome back!' }] },
          session_id: 'sess-mem',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-mem',
        },
      ]);
      installSdkMock(sdkMock);

      const memoryContext = 'preferred-stack: React + TypeScript\nlast-project: TalkTerm';
      const backend = new ClaudeSdkBackend(
        createMockAuditRepo(),
        () => 'sk-ant-test-key',
        () => 'api-key',
        () => 'DJ',
        () => memoryContext,
      );
      await collectEvents(
        backend.startSession({ workspacePath: '/tmp/proj', apiKey: 'sk-ant-test-key' }),
      );

      expect(sdkMock.query).toHaveBeenCalledTimes(1);
      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: { systemPrompt: { append: string } } },
      ];
      expect(callArgs[0].options.systemPrompt.append).toContain('cross-session-memory');
      expect(callArgs[0].options.systemPrompt.append).toContain('preferred-stack');
    });

    it('does not include memory section when getMemoryContext returns null', async () => {
      const sdkMock = mockSdkModule([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
          session_id: 'sess-no-mem',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          total_cost_usd: 0.001,
          num_turns: 1,
          session_id: 'sess-no-mem',
        },
      ]);
      installSdkMock(sdkMock);

      const backend = new ClaudeSdkBackend(
        createMockAuditRepo(),
        () => 'sk-ant-test-key',
        () => 'api-key',
        () => 'DJ',
        () => null,
      );
      await collectEvents(
        backend.startSession({ workspacePath: '/tmp/proj', apiKey: 'sk-ant-test-key' }),
      );

      const callArgs = sdkMock.query.mock.calls[0] as [
        { prompt: string; options: { systemPrompt: { append: string } } },
      ];
      expect(callArgs[0].options.systemPrompt.append).not.toContain('cross-session-memory');
    });
  });
});
