/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockIpcMain, createMockWebContents } from '../../../test/support/fixtures/ipc';
import type { AgentEvent } from '../../shared/types/domain/agent-event';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import type { AgentMessageRouter } from '../agent/agent-message-router';
import { AgentIPCHandler } from './agent-ipc-handler';
import type { IPCMain } from './ipc-registrar';

function createMockRouter(): AgentMessageRouter {
  return {
    onEvent: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    respondToConfirmation: vi.fn(),
    resumeSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentMessageRouter;
}

function createMockSessionRepo(workspacePath: string = '/tmp'): SessionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockReturnValue({ id: 'session-1', workspacePath, status: 'active' }),
    findByStatus: vi.fn().mockReturnValue([]),
    findByWorkspace: vi.fn().mockReturnValue([]),
    findIncomplete: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updateSdkSessionId: vi.fn(),
  } as unknown as SessionRepository;
}

describe('AgentIPCHandler', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let listeners: Map<string, (...args: unknown[]) => void>;
  let ipcMain: IPCMain;

  beforeEach(() => {
    const mock = createMockIpcMain();
    ipcMain = mock.ipcMain;
    handlers = mock.handlers;
    listeners = new Map();
    // Capture `on` registrations for fire-and-forget channels
    ipcMain.on = vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => void) => {
      listeners.set(channel, handler);
    });
  });

  it('registers agent:action as a handle channel', () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    expect(handlers.has(IPC_CHANNELS.AGENT_ACTION)).toBe(true);
  });

  it('registers agent:cancel as an on channel', () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    expect(listeners.has(IPC_CHANNELS.AGENT_CANCEL)).toBe(true);
  });

  it('channel names follow agent:verb convention', () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    expect(IPC_CHANNELS.AGENT_ACTION).toBe('agent:action');
    for (const channel of [...handlers.keys(), ...listeners.keys()]) {
      expect(channel).toMatch(/^agent:/);
    }
  });

  it('sets up event forwarding during register and sends events to webContents', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();
    const sessionRepo = createMockSessionRepo('/home/user/project');

    // Capture the onEvent callback registered during register()
    let eventForwarder: ((event: AgentEvent) => void) | undefined;
    vi.mocked(router.onEvent).mockImplementation((cb) => {
      eventForwarder = cb;
    });

    // Simulate the router calling the event forwarder during sendMessage
    vi.mocked(router.sendMessage).mockImplementation(() => {
      eventForwarder?.({ type: 'text', content: 'Hello' });
      eventForwarder?.({ type: 'complete', summary: 'Done' });
      return Promise.resolve();
    });

    const handler = new AgentIPCHandler(router, () => webContents, sessionRepo);
    handler.register(ipcMain);

    // onEvent should be called once during register, not per sendMessage
    expect(router.onEvent).toHaveBeenCalledOnce();

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await agentAction?.({}, 'session-1', 'Hello agent');

    expect(router.sendMessage).toHaveBeenCalledWith(
      'session-1',
      'Hello agent',
      '/home/user/project',
    );
    expect(webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.AGENT_MESSAGE, {
      type: 'text',
      content: 'Hello',
    });
    expect(webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.AGENT_MESSAGE, {
      type: 'complete',
      summary: 'Done',
    });
  });

  it('passes workspace path from session repo to router.sendMessage', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();
    const sessionRepo = createMockSessionRepo('/tmp');

    const handler = new AgentIPCHandler(router, () => webContents, sessionRepo);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await agentAction?.({}, 'session-1', 'test message');

    expect(sessionRepo.findById).toHaveBeenCalledWith('session-1');
    expect(router.sendMessage).toHaveBeenCalledWith('session-1', 'test message', '/tmp');
  });

  it('passes undefined workspace path when no session repo is provided', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();

    const handler = new AgentIPCHandler(router, () => webContents);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await agentAction?.({}, 'session-1', 'test message');

    expect(router.sendMessage).toHaveBeenCalledWith('session-1', 'test message', undefined);
  });

  it('throws when sessionId is not a string', async () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await expect(agentAction?.({}, 123, 'test')).rejects.toThrow(
      'sessionId must be a non-empty string',
    );
  });

  it('throws when sessionId is empty string', async () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await expect(agentAction?.({}, '', 'test')).rejects.toThrow(
      'sessionId must be a non-empty string',
    );
  });

  it('throws when message is not a string', async () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await expect(agentAction?.({}, 'session-1', 123)).rejects.toThrow(
      'message must be a non-empty string',
    );
  });

  it('throws when message is empty string', async () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await expect(agentAction?.({}, 'session-1', '')).rejects.toThrow(
      'message must be a non-empty string',
    );
  });

  it('throws when no active window is available', async () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => null);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    await expect(agentAction?.({}, 'session-1', 'test')).rejects.toThrow('No active window');
  });

  it('sends error event to renderer when router.sendMessage throws', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();
    vi.mocked(router.sendMessage).mockRejectedValue(new Error('Backend failure'));

    const handler = new AgentIPCHandler(router, () => webContents);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    // Should NOT throw — error is sent as an event
    await agentAction?.({}, 'session-1', 'test');

    expect(webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_MESSAGE,
      expect.objectContaining({
        type: 'error',
        userMessage: 'Something went wrong, but we can work through it.',
      }),
    );
  });

  it('calls router.cancel on agent:cancel', () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const cancelHandler = listeners.get(IPC_CHANNELS.AGENT_CANCEL);
    cancelHandler?.({});

    expect(router.cancel).toHaveBeenCalled();
  });

  it('forwards agent:confirm decisions to router.respondToConfirmation', () => {
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    const confirmHandler = listeners.get(IPC_CHANNELS.AGENT_CONFIRM);
    confirmHandler?.({}, true);
    confirmHandler?.({}, false);

    expect(router.respondToConfirmation).toHaveBeenNthCalledWith(1, true);
    expect(router.respondToConfirmation).toHaveBeenNthCalledWith(2, false);
  });

  it('ignores agent:confirm with a non-boolean payload', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = createMockRouter();
    const handler = new AgentIPCHandler(router, () => createMockWebContents());
    handler.register(ipcMain);

    listeners.get(IPC_CHANNELS.AGENT_CONFIRM)?.({}, 'yes');

    expect(router.respondToConfirmation).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('serializes concurrent agent:action requests for the same session', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();
    const callOrder: string[] = [];
    let finishFirst!: () => void;

    vi.mocked(router.sendMessage)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push('start-1');
            finishFirst = () => {
              callOrder.push('end-1');
              resolve();
            };
          }),
      )
      .mockImplementationOnce(() => {
        callOrder.push('start-2');
        callOrder.push('end-2');
        return Promise.resolve();
      });

    const handler = new AgentIPCHandler(router, () => webContents);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    const p1 = agentAction?.({}, 'session-1', 'first');
    const p2 = agentAction?.({}, 'session-1', 'second');

    await vi.waitFor(() => {
      expect(callOrder).toEqual(['start-1']);
    });

    finishFirst();
    await Promise.all([p1, p2]);

    expect(callOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('cancels queued agent:action turns when agent:cancel is triggered while a turn is running', async () => {
    const router = createMockRouter();
    const webContents = createMockWebContents();
    const callOrder: string[] = [];
    let finishFirst!: () => void;

    vi.mocked(router.sendMessage)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push('start-1');
            finishFirst = () => {
              callOrder.push('end-1');
              resolve();
            };
          }),
      )
      .mockImplementationOnce(() => {
        callOrder.push('start-2');
        return Promise.resolve();
      });

    const handler = new AgentIPCHandler(router, () => webContents);
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    const cancelHandler = listeners.get(IPC_CHANNELS.AGENT_CANCEL);
    const p1 = agentAction?.({}, 'session-1', 'first');
    const p2 = agentAction?.({}, 'session-1', 'second');

    await vi.waitFor(() => {
      expect(callOrder).toEqual(['start-1']);
    });

    cancelHandler?.({});
    finishFirst();
    await Promise.all([p1, p2]);

    expect(router.cancel).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['start-1', 'end-1']);
  });

  it('cancels active and queued operations on cancelActiveOperations and ignores destroyed WebContents', async () => {
    const router = createMockRouter();
    const destroyedSend = vi.fn();
    let eventForwarder: ((event: AgentEvent) => void) | undefined;
    vi.mocked(router.onEvent).mockImplementation((cb) => {
      eventForwarder = cb;
    });

    let finishFirst!: () => void;
    const callOrder: string[] = [];
    vi.mocked(router.sendMessage)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            callOrder.push('start-1');
            finishFirst = () => {
              callOrder.push('end-1');
              resolve();
            };
          }),
      )
      .mockImplementationOnce(() => {
        callOrder.push('start-2');
        return Promise.resolve();
      });

    let destroyed = false;
    const handler = new AgentIPCHandler(router, () => ({
      send: destroyedSend,
      isDestroyed: () => destroyed,
    }));
    handler.register(ipcMain);

    const agentAction = handlers.get(IPC_CHANNELS.AGENT_ACTION);
    const p1 = agentAction?.({}, 'session-1', 'first');
    const p2 = agentAction?.({}, 'session-1', 'second');

    await vi.waitFor(() => {
      expect(callOrder).toEqual(['start-1']);
    });

    // Simulate window closing while turn is active
    destroyed = true;
    handler.cancelActiveOperations();
    eventForwarder?.({ type: 'text', content: 'dropped' });
    expect(destroyedSend).not.toHaveBeenCalled();

    finishFirst();
    await Promise.all([p1, p2]);
    expect(router.cancel).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['start-1', 'end-1']);
  });
});
