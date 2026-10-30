import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from './ipc-channels';
import { createIPCMessage } from './ipc-message';

describe('createIPCMessage', () => {
  it('creates a message with channel and payload', () => {
    const msg = createIPCMessage(IPC_CHANNELS.AGENT_MESSAGE, { text: 'hello' });
    expect(msg.channel).toBe('agent:message');
    expect(msg.payload).toEqual({ text: 'hello' });
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('uses current timestamp', () => {
    const before = Date.now();
    const msg = createIPCMessage(IPC_CHANNELS.SESSION_START, null);
    const after = Date.now();
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });
});
