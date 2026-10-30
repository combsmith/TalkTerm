import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAgentBackend } from '../../src/main/agent/fake-agent-backend';
import { AgentMessageRouter } from '../../src/main/agent/agent-message-router';
import type { AgentEvent } from '../../src/shared/types/domain/agent-event';

/**
 * Agent Message Flow Integration Tests
 * Covers FR10 (message routing), FR11 (streaming), FR15 (cancel), FR22 (error events)
 *
 * Tests the real FakeAgentBackend -> AgentMessageRouter pipeline without mocks.
 * Verifies event ordering, cancellation propagation, and error event flow.
 */
describe('Agent Message Flow Integration', () => {
  let backend: FakeAgentBackend;
  let router: AgentMessageRouter;

  beforeEach(() => {
    backend = new FakeAgentBackend();
    router = new AgentMessageRouter(backend);
  });

  it('routes events from FakeAgentBackend through handler in order', async () => {
    const events: AgentEvent[] = [
      { type: 'text', content: 'Starting analysis...' },
      { type: 'tool-call', toolName: 'bash', toolInput: { command: 'ls' } },
      { type: 'tool-result', toolName: 'bash', output: 'file1.ts\nfile2.ts', success: true },
      { type: 'text', content: 'Found 2 files.' },
      { type: 'complete', summary: 'Analysis complete' },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.startSession({
      workspacePath: '/home/user/project',
      apiKey: 'test-key',
    });

    expect(received).toHaveLength(5);
    expect(received[0]).toEqual({ type: 'text', content: 'Starting analysis...' });
    expect(received[1]).toEqual({
      type: 'tool-call',
      toolName: 'bash',
      toolInput: { command: 'ls' },
    });
    expect(received[2]).toEqual({
      type: 'tool-result',
      toolName: 'bash',
      output: 'file1.ts\nfile2.ts',
      success: true,
    });
    expect(received[3]).toEqual({ type: 'text', content: 'Found 2 files.' });
    expect(received[4]).toEqual({ type: 'complete', summary: 'Analysis complete' });
  });

  it('maintains message stream order during sendMessage', async () => {
    const events: AgentEvent[] = [
      { type: 'text', content: 'Processing...' },
      {
        type: 'progress',
        step: 'Analyzing code',
        status: 'in-progress',
      },
      {
        type: 'progress',
        step: 'Analyzing code',
        status: 'completed',
      },
      { type: 'text', content: 'Done.' },
      { type: 'complete', summary: 'Finished' },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.sendMessage('session-1', 'Analyze the code');

    expect(received).toHaveLength(5);
    // Verify strict ordering
    expect(received.map((e) => e.type)).toEqual([
      'text',
      'progress',
      'progress',
      'text',
      'complete',
    ]);
  });

  it('cancel propagates through the stack', async () => {
    // Queue many events; cancel mid-stream
    const manyEvents: AgentEvent[] = Array.from({ length: 100 }, (_, i) => ({
      type: 'text' as const,
      content: `Message ${String(i)}`,
    }));
    backend.queueEvents(manyEvents);

    const received: AgentEvent[] = [];
    let cancelledAfter = -1;
    router.onEvent((event) => {
      received.push(event);
      // Cancel after receiving 3 events
      if (received.length === 3) {
        router.cancel();
        cancelledAfter = received.length;
      }
    });

    await router.startSession({
      workspacePath: '/home/user/project',
      apiKey: 'test-key',
    });

    expect(cancelledAfter).toBe(3);
    // The FakeAgentBackend checks _cancelled before each yield,
    // so we should receive at most a few more events after cancel
    expect(received.length).toBeLessThan(100);
    expect(backend.cancelled).toBe(true);
  });

  it('error events flow through the handler', async () => {
    const events: AgentEvent[] = [
      { type: 'text', content: 'Starting...' },
      {
        type: 'error',
        userMessage: "I'm having trouble reaching the service.",
        recoveryOptions: [
          { label: 'Retry', action: 'retry', description: 'Try the request again' },
        ],
      },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.startSession({
      workspacePath: '/home/user/project',
      apiKey: 'test-key',
    });

    expect(received).toHaveLength(2);
    const errorEvent = received[1]!;
    expect(errorEvent.type).toBe('error');
    if (errorEvent.type === 'error') {
      expect(errorEvent.userMessage).toContain('trouble reaching');
      expect(errorEvent.recoveryOptions).toHaveLength(1);
      expect(errorEvent.recoveryOptions[0]?.action).toBe('retry');
    }
  });

  it('routes events during session resume', async () => {
    const events: AgentEvent[] = [
      { type: 'text', content: 'Session resumed.' },
      { type: 'complete', summary: 'Resumed successfully' },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.resumeSession('session-123');

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'text', content: 'Session resumed.' });
    expect(received[1]).toEqual({ type: 'complete', summary: 'Resumed successfully' });
  });

  it('handles empty event stream gracefully', async () => {
    backend.queueEvents([]);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.startSession({
      workspacePath: '/home/user/project',
      apiKey: 'test-key',
    });

    expect(received).toHaveLength(0);
  });

  it('confirm-request events flow through correctly', async () => {
    const events: AgentEvent[] = [
      {
        type: 'confirm-request',
        action: 'file:delete',
        description: 'Delete /home/user/project/temp.log',
      },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    router.onEvent((event) => received.push(event));

    await router.startSession({
      workspacePath: '/home/user/project',
      apiKey: 'test-key',
    });

    expect(received).toHaveLength(1);
    const confirmEvent = received[0]!;
    expect(confirmEvent.type).toBe('confirm-request');
    if (confirmEvent.type === 'confirm-request') {
      expect(confirmEvent.action).toBe('file:delete');
      expect(confirmEvent.description).toContain('temp.log');
    }
  });
});
