/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import { InMemoryConfigStore } from '../storage/electron-config-store';
import type { IPCMain } from './ipc-registrar';
import { SessionIPCHandler } from './session-ipc-handler';

function createMockSessionRepo(): SessionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByStatus: vi.fn().mockReturnValue([]),
    findByWorkspace: vi.fn().mockReturnValue([]),
    findIncomplete: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updateSdkSessionId: vi.fn(),
  };
}

describe('SessionIPCHandler', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let ipcMain: IPCMain;

  beforeEach(() => {
    handlers = new Map();
    ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
      on: vi.fn(),
    };
  });

  it('registers session channels', () => {
    new SessionIPCHandler(createMockSessionRepo(), new InMemoryConfigStore()).register(ipcMain);
    expect(handlers.has(IPC_CHANNELS.SESSION_START)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SESSION_RESUME)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.LAUNCH_ASSESS_STATE)).toBe(true);
  });

  it('starts a new session', () => {
    const repo = createMockSessionRepo();
    const store = new InMemoryConfigStore();
    store.set('userProfile', {
      name: 'Root',
      avatarPersonaId: 'mary',
      createdAt: '',
      updatedAt: '',
    });
    new SessionIPCHandler(repo, store).register(ipcMain);
    const start = handlers.get(IPC_CHANNELS.SESSION_START);
    const id = start?.({}, path.join(os.tmpdir(), 'talkterm-test-project')) as string;
    expect(typeof id).toBe('string');
    expect(repo.save).toHaveBeenCalled();
  });

  it('assesses launch state', () => {
    const store = new InMemoryConfigStore();
    new SessionIPCHandler(createMockSessionRepo(), store).register(ipcMain);
    const assess = handlers.get(IPC_CHANNELS.LAUNCH_ASSESS_STATE);
    const state = assess?.({}) as {
      profileComplete: boolean;
      avatarSelected: boolean;
      workspaceSelected: boolean;
    };
    expect(state.profileComplete).toBe(false); // No profile set
    expect(state.avatarSelected).toBe(false); // No profile or avatar set
    expect(state.workspaceSelected).toBe(false);
  });

  it('reports apiKeyValid when key is stored in keyManager or subscription mode is set', () => {
    const store = new InMemoryConfigStore();
    const keyManager = {
      storeKey: vi.fn(),
      retrieveKey: vi.fn().mockReturnValue('sk-ant-api03-test'),
      deleteKey: vi.fn(),
      hasKey: vi.fn().mockReturnValue(true),
    };
    new SessionIPCHandler(createMockSessionRepo(), store, keyManager).register(ipcMain);
    const assess = handlers.get(IPC_CHANNELS.LAUNCH_ASSESS_STATE);
    const stateWithKey = assess?.({}) as { apiKeyValid: boolean };
    expect(stateWithKey.apiKeyValid).toBe(true);

    keyManager.hasKey.mockReturnValue(false);
    store.set('authMode', 'claude-subscription');
    const stateWithSub = assess?.({}) as { apiKeyValid: boolean };
    expect(stateWithSub.apiKeyValid).toBe(true);
  });

  it('assesses complete state when profile exists', () => {
    const store = new InMemoryConfigStore();
    store.set('userProfile', {
      name: 'Root',
      avatarPersonaId: 'mary',
      createdAt: '',
      updatedAt: '',
    });
    store.set('workspacePath', path.join(os.tmpdir(), 'talkterm-test-workspace'));
    new SessionIPCHandler(createMockSessionRepo(), store).register(ipcMain);
    const assess = handlers.get(IPC_CHANNELS.LAUNCH_ASSESS_STATE);
    const state = assess?.({}) as {
      profileComplete: boolean;
      avatarSelected: boolean;
      workspaceSelected: boolean;
    };
    expect(state.profileComplete).toBe(true);
    expect(state.avatarSelected).toBe(true);
    expect(state.workspaceSelected).toBe(true);
  });

  it('triggers agentRouter.startSession when SESSION_START is invoked', () => {
    const repo = createMockSessionRepo();
    const store = new InMemoryConfigStore();
    const keyManager = {
      storeKey: vi.fn(),
      retrieveKey: vi.fn().mockReturnValue('sk-ant-api03-test'),
      deleteKey: vi.fn(),
      hasKey: vi.fn().mockReturnValue(true),
    };
    const agentRouter = {
      startSession: vi.fn().mockResolvedValue(undefined),
    };
    new SessionIPCHandler(repo, store, keyManager, agentRouter).register(ipcMain);
    const start = handlers.get(IPC_CHANNELS.SESSION_START);
    const workspace = path.join(os.tmpdir(), 'talkterm-test-project');
    const sessionId = start?.({}, workspace) as string;
    expect(agentRouter.startSession).toHaveBeenCalledWith({
      sessionId,
      workspacePath: workspace,
      apiKey: 'sk-ant-api03-test',
    });
  });

  it('resolves empty workspacePath to os.tmpdir() when starting a session without a chosen workspace', () => {
    const repo = createMockSessionRepo();
    const store = new InMemoryConfigStore();
    const agentRouter = {
      startSession: vi.fn().mockResolvedValue(undefined),
    };
    new SessionIPCHandler(repo, store, undefined, agentRouter).register(ipcMain);
    const start = handlers.get(IPC_CHANNELS.SESSION_START);
    const sessionId = start?.({}, '') as string;
    expect(typeof sessionId).toBe('string');
    expect(agentRouter.startSession).toHaveBeenCalledWith({
      sessionId,
      workspacePath: os.tmpdir(),
      apiKey: expect.any(String) as string,
    });
    expect(() => start?.({}, 123)).toThrow('workspacePath must be a non-empty string');
  });

  it('triggers agentRouter.resumeSession when SESSION_RESUME is invoked', () => {
    const repo = createMockSessionRepo();
    vi.mocked(repo.findById).mockReturnValue({
      id: 'sess-123',
      sdkSessionId: 'sdk-123',
      workspacePath: '/projects/app',
      avatarPersonaId: 'mary',
      status: 'paused',
      createdAt: '',
      updatedAt: '',
    });
    const store = new InMemoryConfigStore();
    const agentRouter = {
      startSession: vi.fn().mockResolvedValue(undefined),
      resumeSession: vi.fn().mockResolvedValue(undefined),
    };
    new SessionIPCHandler(repo, store, undefined, agentRouter).register(ipcMain);
    const resume = handlers.get(IPC_CHANNELS.SESSION_RESUME);
    const result = resume?.({}, 'sess-123');
    expect(repo.updateStatus).toHaveBeenCalledWith('sess-123', 'active');
    expect(agentRouter.resumeSession).toHaveBeenCalledWith('sess-123');
    expect(result).toMatchObject({ id: 'sess-123' });
  });
});
