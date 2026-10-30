import type { IPCChannel } from './ipc-channels';

export interface IPCMessage<T> {
  channel: IPCChannel;
  payload: T;
  timestamp: number;
}

export function createIPCMessage<T>(channel: IPCChannel, payload: T): IPCMessage<T> {
  return {
    channel,
    payload,
    timestamp: Date.now(),
  };
}
