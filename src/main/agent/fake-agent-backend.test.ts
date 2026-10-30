import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '../../shared/types/domain/agent-event';
import { FakeAgentBackend } from './fake-agent-backend';

describe('FakeAgentBackend', () => {
  it('implements AgentBackend interface', () => {
    const backend = new FakeAgentBackend();
    expect(typeof backend.startSession).toBe('function');
    expect(typeof backend.sendMessage).toBe('function');
    expect(typeof backend.cancelCurrentAction).toBe('function');
    expect(typeof backend.resumeSession).toBe('function');
  });

  it('yields queued events from startSession', () => {
    const backend = new FakeAgentBackend();
    const events: AgentEvent[] = [
      { type: 'text', content: 'Hello' },
      { type: 'complete', summary: 'Done' },
    ];
    backend.queueEvents(events);

    const received: AgentEvent[] = [];
    for (const event of backend.startSession({ workspacePath: '/tmp', apiKey: 'test-key' })) {
      received.push(event);
    }

    expect(received).toEqual(events);
  });

  it('yields queued events from sendMessage', () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([{ type: 'text', content: 'Response' }]);

    const received: AgentEvent[] = [];
    for (const event of backend.sendMessage('session-1', 'hello')) {
      received.push(event);
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'text', content: 'Response' });
  });

  it('stops yielding when cancelled', () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([
      { type: 'text', content: 'First' },
      { type: 'text', content: 'Second' },
      { type: 'text', content: 'Third' },
    ]);

    const received: AgentEvent[] = [];
    for (const event of backend.startSession({ workspacePath: '/tmp', apiKey: 'test' })) {
      received.push(event);
      if (received.length === 1) {
        backend.cancelCurrentAction();
      }
    }

    expect(received).toHaveLength(1);
    expect(backend.cancelled).toBe(true);
  });

  it('yields events from resumeSession', () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([{ type: 'text', content: 'Resumed' }]);

    const received: AgentEvent[] = [];
    for (const event of backend.resumeSession('session-1')) {
      received.push(event);
    }

    expect(received).toHaveLength(1);
  });

  it('stops yielding sendMessage events when cancelled mid-iteration', () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([
      { type: 'text', content: 'First' },
      { type: 'text', content: 'Second' },
    ]);

    const received: AgentEvent[] = [];
    for (const event of backend.sendMessage('session-1', 'hello')) {
      received.push(event);
      backend.cancelCurrentAction();
    }

    expect(received).toHaveLength(1);
    expect(backend.cancelled).toBe(true);
  });

  it('stops yielding resumeSession events when cancelled mid-iteration', () => {
    const backend = new FakeAgentBackend();
    backend.queueEvents([
      { type: 'text', content: 'First' },
      { type: 'text', content: 'Second' },
    ]);

    const received: AgentEvent[] = [];
    for (const event of backend.resumeSession('session-1')) {
      received.push(event);
      backend.cancelCurrentAction();
    }

    expect(received).toHaveLength(1);
    expect(backend.cancelled).toBe(true);
  });
});
