import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from './ipc-channels';

describe('IPC_CHANNELS', () => {
  it('all channels follow namespace:verb pattern', () => {
    for (const [_key, channel] of Object.entries(IPC_CHANNELS)) {
      expect(channel).toMatch(/^[a-z]+:[a-z][-a-z]*$/);
    }
  });

  it('has no duplicate channel values', () => {
    const values = Object.values(IPC_CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });
});
