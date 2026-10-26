import { describe, it, expect, vi } from 'vitest';
import { AgentMessageRouter } from './agent-message-router';
import { FakeAgentBackend } from './fake-agent-backend';

describe('AgentMessageRouter', () => {
  it('routes events from startSession to handler', async () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([
      { type: 'text', content: 'Hello' },
      { type: 'complete', summary: 'Done' },
    ]);

    const router = new AgentMessageRouter(backend);
    const handler = vi.fn();
    router.onEvent(handler);

    await router.startSession({ workspacePath: '/tmp', apiKey: 'test' });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, { type: 'text', content: 'Hello' });
    expect(handler).toHaveBeenNthCalledWith(2, { type: 'complete', summary: 'Done' });
  });

  it('routes events from sendMessage to handler', async () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([{ type: 'text', content: 'Response' }]);

    const router = new AgentMessageRouter(backend);
    const handler = vi.fn();
    router.onEvent(handler);

    await router.sendMessage('session-1', 'hello');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cancels the backend', () => {
    const backend = new FakeAgentBackend();
    const router = new AgentMessageRouter(backend);

    router.cancel();

    expect(backend.cancelled).toBe(true);
  });

  it('forwards confirmation decisions to the backend without queueing', () => {
    const backend = new FakeAgentBackend();
    const router = new AgentMessageRouter(backend);

    router.respondToConfirmation(true);
    router.respondToConfirmation(false);

    expect(backend.confirmations).toEqual([true, false]);
  });

  it('does not throw when no handler is set', async () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([{ type: 'text', content: 'Hello' }]);

    const router = new AgentMessageRouter(backend);

    await expect(
      router.startSession({ workspacePath: '/tmp', apiKey: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('serializes startSession with subsequent sendMessage and resumeSession turns', async () => {
    const order: string[] = [];
    let releaseStart!: () => void;

    const backend = {
      async *startSession() {
        order.push('start-begin');
        await new Promise<void>((resolve) => {
          releaseStart = resolve;
        });
        order.push('start-end');
        yield { type: 'text' as const, content: 'Greeting' };
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async *sendMessage() {
        order.push('send');
        yield { type: 'text' as const, content: 'Reply' };
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async *resumeSession() {
        order.push('resume');
        yield { type: 'text' as const, content: 'Resumed' };
      },
      cancelCurrentAction: vi.fn(),
      respondToConfirmation: vi.fn(),
    };

    const router = new AgentMessageRouter(backend);
    const pStart = router.startSession({ workspacePath: '/tmp', apiKey: 'key' });
    const pSend = router.sendMessage('s1', 'hello');
    const pResume = router.resumeSession('s1');

    expect(order).toEqual(['start-begin']);
    releaseStart();
    await Promise.all([pStart, pSend, pResume]);
    expect(order).toEqual(['start-begin', 'start-end', 'send', 'resume']);
  });
});
