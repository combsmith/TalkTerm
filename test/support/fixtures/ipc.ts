import { vi } from 'vitest';
import type { IPCMain } from '../../../src/main/ipc/ipc-registrar';

export function createMockIpcMain(): {
  ipcMain: IPCMain;
  handlers: Map<string, (...args: unknown[]) => unknown>;
} {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain: IPCMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn(),
  };
  return { ipcMain, handlers };
}

export function createMockWebContents(): {
  send: ReturnType<typeof vi.fn<(channel: string, ...args: unknown[]) => void>>;
} {
  return {
    send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
  };
}
