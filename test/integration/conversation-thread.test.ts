import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentMessageRouter } from '../../src/main/agent/agent-message-router';
import { ClaudeSdkBackend } from '../../src/main/agent/claude-sdk-backend';
import type { AgentEvent } from '../../src/shared/types/domain/agent-event';
import type { AuditRepository } from '../../src/shared/types/ports/audit-repository';
import { createMockAuditRepo } from '../support/fixtures/repositories';

/**
 * Conversation Thread Integration Tests
 *
 * Verifies the full ClaudeSdkBackend → AgentMessageRouter pipeline
 * with a mocked SDK module. Tests that SDK messages are correctly
 * mapped to domain events and routed through the pipeline.
 */

function createMockSdkQuery(
  messages: Array<Record<string, unknown>>,
): AsyncGenerator<Record<string, unknown>, void> & { interrupt: () => Promise<void> } {
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

function sdkTextResponse(text: string, sessionId: string): Array<Record<string, unknown>> {
  return [
    {
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
      session_id: sessionId,
    },
    {
      type: 'result',
      subtype: 'success',
      result: 'Done',
      total_cost_usd: 0.001,
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

describe('Conversation Thread Continuity', () => {
  let auditRepo: AuditRepository;
  let backend: ClaudeSdkBackend;
  let router: AgentMessageRouter;
  let querySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    auditRepo = createMockAuditRepo();

    // Set up SDK mock that returns different responses per call
    let callCount = 0;
    const responses: Array<Array<Record<string, unknown>>> = [];

    querySpy = vi.fn().mockImplementation(() => {
      const idx = callCount++;
      const msgs = responses[idx] ?? sdkTextResponse(`Response ${String(idx + 1)}`, 'sess');
      return createMockSdkQuery(msgs);
    });

    // Expose a way to queue responses
    (
      querySpy as ReturnType<typeof vi.fn> & {
        queueResponse: (r: Array<Record<string, unknown>>) => void;
      }
    ).queueResponse = (r: Array<Record<string, unknown>>): void => {
      responses.push(r);
    };

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: querySpy }));

    backend = new ClaudeSdkBackend(auditRepo, () => 'sk-ant-test-key');
    router = new AgentMessageRouter(backend);
  });

  function queueResponse(text: string, sessionId: string): void {
    const fn = querySpy as ReturnType<typeof vi.fn> & {
      queueResponse: (r: Array<Record<string, unknown>>) => void;
    };
    fn.queueResponse(sdkTextResponse(text, sessionId));
  }

  async function collectEvents(action: () => Promise<void>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    router.onEvent((event) => events.push(event));
    await action();
    return events;
  }

  function getTextContent(events: AgentEvent[]): string {
    return events
      .filter((e): e is AgentEvent & { type: 'text' } => e.type === 'text')
      .map((e) => e.content)
      .join(' ');
  }

  it('routes SDK responses through the full pipeline across 5 turns', async () => {
    const sessionId = 'test-session-1';
    const allResponses: string[] = [];

    queueResponse('Great, let me help you brainstorm features for a mobile app!', sessionId);
    queueResponse('Push notifications are a great idea for engagement.', sessionId);
    queueResponse('I can help research the competition in this space.', sessionId);
    queueResponse('Let me outline an architecture approach for your app.', sessionId);
    queueResponse(
      'Here is a recap: we discussed brainstorming, notifications, research, and architecture.',
      sessionId,
    );

    // Turn 1
    const turn1 = await collectEvents(() =>
      router.sendMessage(sessionId, 'help me brainstorm features for a mobile app'),
    );
    const text1 = getTextContent(turn1);
    allResponses.push(text1);
    expect(text1.toLowerCase()).toContain('brainstorm');
    expect(turn1.some((e) => e.type === 'complete')).toBe(true);

    // Turn 2
    const turn2 = await collectEvents(() =>
      router.sendMessage(sessionId, 'what about adding push notifications?'),
    );
    const text2 = getTextContent(turn2);
    allResponses.push(text2);
    expect(text2.length).toBeGreaterThan(10);
    expect(turn2.some((e) => e.type === 'complete')).toBe(true);

    // Turn 3
    const turn3 = await collectEvents(() =>
      router.sendMessage(sessionId, 'let me research the competition'),
    );
    const text3 = getTextContent(turn3);
    allResponses.push(text3);
    expect(text3.toLowerCase()).toContain('research');
    expect(turn3.some((e) => e.type === 'complete')).toBe(true);

    // Turn 4
    const turn4 = await collectEvents(() =>
      router.sendMessage(sessionId, 'now help me think about the architecture'),
    );
    const text4 = getTextContent(turn4);
    allResponses.push(text4);
    expect(text4.toLowerCase()).toContain('architecture');
    expect(turn4.some((e) => e.type === 'complete')).toBe(true);

    // Turn 5
    const turn5 = await collectEvents(() =>
      router.sendMessage(sessionId, 'can you summarize what we discussed?'),
    );
    const text5 = getTextContent(turn5);
    allResponses.push(text5);
    expect(text5.toLowerCase()).toContain('recap');
    expect(turn5.some((e) => e.type === 'complete')).toBe(true);

    // All 5 turns produced distinct responses
    expect(allResponses).toHaveLength(5);
    const uniqueResponses = new Set(allResponses);
    expect(uniqueResponses.size).toBe(5);

    // SDK query() was called 5 times
    expect(querySpy).toHaveBeenCalledTimes(5);
  });

  it('keeps separate history for different sessions', async () => {
    queueResponse('Let me help you brainstorm!', 'session-A');
    queueResponse('Great architecture question.', 'session-A');
    queueResponse('Hello! I am ready to help.', 'session-B');
    queueResponse('Here is a recap of our session A discussion.', 'session-A');

    // Session A
    await collectEvents(() => router.sendMessage('session-A', 'help me brainstorm'));
    await collectEvents(() => router.sendMessage('session-A', 'what about the architecture'));

    // Session B — independent
    const sessionB = await collectEvents(() => router.sendMessage('session-B', 'hello'));
    const textB = getTextContent(sessionB);
    expect(textB).toContain('Hello');

    // Session A follow-up
    const sessionAFollow = await collectEvents(() =>
      router.sendMessage('session-A', 'summarize our discussion'),
    );
    const textA = getTextContent(sessionAFollow);
    expect(textA.toLowerCase()).toContain('recap');

    // All 4 calls went through SDK
    expect(querySpy).toHaveBeenCalledTimes(4);
  });

  it('SDK query receives the user message as prompt', async () => {
    queueResponse('Here is info about the weather app.', 'ctx-test');
    queueResponse('Those are great features for a weather app.', 'ctx-test');

    await collectEvents(() => router.sendMessage('ctx-test', 'I want to build a weather app'));
    await collectEvents(() => router.sendMessage('ctx-test', 'what features should it have?'));

    // Verify SDK received the exact user messages
    const calls = querySpy.mock.calls as Array<[{ prompt: string }]>;
    expect(calls[0]![0].prompt).toBe('I want to build a weather app');
    expect(calls[1]![0].prompt).toBe('what features should it have?');
  });

  it('audits every user message across turns', async () => {
    for (let i = 0; i < 5; i++) {
      queueResponse(`Response ${String(i + 1)}`, 'audit-test');
    }

    await collectEvents(() => router.sendMessage('audit-test', 'first message'));
    await collectEvents(() => router.sendMessage('audit-test', 'second message'));
    await collectEvents(() => router.sendMessage('audit-test', 'third message'));
    await collectEvents(() => router.sendMessage('audit-test', 'fourth message'));
    await collectEvents(() => router.sendMessage('audit-test', 'fifth message'));

    // auditRepo.append: 5 user messages + 5 agent responses = 10 calls
    expect(auditRepo.append).toHaveBeenCalledTimes(10);
  });

  it('each turn produces text and complete events', async () => {
    const sessionId = 'event-structure-test';

    for (let i = 1; i <= 5; i++) {
      queueResponse(`Turn ${String(i)} response`, sessionId);
    }

    for (let i = 1; i <= 5; i++) {
      const events = await collectEvents(() =>
        router.sendMessage(sessionId, `message ${String(i)}`),
      );
      const types = events.map((e) => e.type);
      expect(types).toContain('text');
      expect(types).toContain('complete');
      // text should come before complete
      expect(types.indexOf('text')).toBeLessThan(types.indexOf('complete'));
    }
  });
});
