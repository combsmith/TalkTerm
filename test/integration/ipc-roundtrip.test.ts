import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockIpcMain, createMockWebContents } from '../support/fixtures/ipc';
import { createMockSessionRepo } from '../support/fixtures/repositories';
import { createMockSafeStorage } from '../support/fixtures/security';
import { IPC_CHANNELS } from '../../src/shared/types/domain/ipc-channels';
import type { IPCChannel } from '../../src/shared/types/domain/ipc-channels';
import { SessionIPCHandler } from '../../src/main/ipc/session-ipc-handler';
import { SettingsIPCHandler } from '../../src/main/ipc/settings-ipc-handler';
import { InMemoryConfigStore } from '../../src/main/storage/electron-config-store';
import { SafeStorageKeyManager } from '../../src/main/security/safe-storage-key-manager';
import type { SessionRepository } from '../../src/shared/types/ports/session-repository';
import type { Session } from '../../src/shared/types/domain/session';

describe('IPC roundtrip integration', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  let sessionRepo: SessionRepository;
  let configStore: InMemoryConfigStore;
  let keyManager: SafeStorageKeyManager;

  beforeEach(() => {
    const mock = createMockIpcMain();
    handlers = mock.handlers;
    sessionRepo = createMockSessionRepo();
    configStore = new InMemoryConfigStore();
    keyManager = new SafeStorageKeyManager(createMockSafeStorage());

    const sessionHandler = new SessionIPCHandler(sessionRepo, configStore, keyManager);
    const settingsHandler = new SettingsIPCHandler(keyManager, configStore);

    sessionHandler.register(mock.ipcMain);
    settingsHandler.register(mock.ipcMain);
  });

  async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return handler({}, ...args);
  }

  describe('namespace:verb channel naming convention', () => {
    it('all IPC_CHANNELS values follow namespace:verb pattern', () => {
      const pattern = /^[a-z]+:[a-z][-a-z]*$/;
      for (const [key, channel] of Object.entries(IPC_CHANNELS)) {
        expect(channel, `${key} = "${channel}" does not match namespace:verb`).toMatch(pattern);
      }
    });
  });

  describe('session handler roundtrips', () => {
    it('session:start creates a session and returns its id', async () => {
      const sessionId = await invoke(IPC_CHANNELS.SESSION_START, '/tmp/workspace');

      expect(typeof sessionId).toBe('string');
      expect(sessionId).toBeTruthy();
      expect(sessionRepo.save).toHaveBeenCalledOnce();
      const savedSession = vi.mocked(sessionRepo.save).mock.calls[0]![0] as Session;
      expect(savedSession.workspacePath).toBe('/tmp/workspace');
      expect(savedSession.status).toBe('active');
    });

    it('session:resume returns session when found', async () => {
      const fakeSession: Session = {
        id: 'test-session-id',
        sdkSessionId: null,
        workspacePath: '/tmp/ws',
        status: 'paused',
        avatarPersonaId: 'mary',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(sessionRepo.findById).mockReturnValue(fakeSession);

      const result = await invoke(IPC_CHANNELS.SESSION_RESUME, 'test-session-id');

      expect(result).toEqual(fakeSession);
      expect(sessionRepo.updateStatus).toHaveBeenCalledWith('test-session-id', 'active');
    });

    it('session:resume throws when session not found', async () => {
      vi.mocked(sessionRepo.findById).mockReturnValue(null);

      await expect(invoke(IPC_CHANNELS.SESSION_RESUME, 'nonexistent')).rejects.toThrow(
        'Session not found: nonexistent',
      );
    });

    it('launch:assess-state returns setup status', async () => {
      configStore.set('userProfile', { name: 'Alice', avatarPersonaId: 'mary' });
      configStore.set('workspacePath', '/tmp/ws');

      const state = (await invoke(IPC_CHANNELS.LAUNCH_ASSESS_STATE)) as Record<string, unknown>;

      expect(state.profileComplete).toBe(true);
      expect(state.avatarSelected).toBe(true);
      expect(state.workspaceSelected).toBe(true);
    });
  });

  describe('settings handler roundtrips', () => {
    it('settings:get-key-state returns none when no key stored', async () => {
      const result = await invoke(IPC_CHANNELS.SETTINGS_GET_KEY_STATE);
      expect(result).toBe('none');
    });

    it('settings:store-key then settings:get-key-state returns valid', async () => {
      await invoke(IPC_CHANNELS.SETTINGS_STORE_KEY, 'sk-ant-test-key');
      const result = await invoke(IPC_CHANNELS.SETTINGS_GET_KEY_STATE);
      expect(result).toBe('valid');
    });

    it('settings:get and settings:set round-trip a value', async () => {
      await invoke(IPC_CHANNELS.SETTINGS_SET, 'theme', 'dark');
      const result = await invoke(IPC_CHANNELS.SETTINGS_GET, 'theme');
      expect(result).toBe('dark');
    });

    it('profile:set then profile:get round-trips profile', async () => {
      await invoke(IPC_CHANNELS.PROFILE_SET, 'Bob');
      const profile = (await invoke(IPC_CHANNELS.PROFILE_GET)) as Record<string, unknown>;

      expect(profile.name).toBe('Bob');
      expect(profile.avatarPersonaId).toBeNull();
      expect(profile.createdAt).toBeDefined();
    });

    it('avatar:select updates the profile persona', async () => {
      await invoke(IPC_CHANNELS.PROFILE_SET, 'Carol');
      await invoke(IPC_CHANNELS.AVATAR_SELECT, 'atlas');

      const profile = (await invoke(IPC_CHANNELS.PROFILE_GET)) as Record<string, unknown>;
      expect(profile.avatarPersonaId).toBe('atlas');
    });
  });

  describe('error wrapping', () => {
    it('handler errors are Error instances, not raw strings', async () => {
      vi.mocked(sessionRepo.findById).mockReturnValue(null);

      try {
        await invoke(IPC_CHANNELS.SESSION_RESUME, 'missing-id');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain('Session not found');
        // No stack trace or raw object leaks -- message is user-safe
        expect((err as Error).message).not.toMatch(/at \w+/);
      }
    });

    it('store-key with encryption available does not throw', async () => {
      await expect(invoke(IPC_CHANNELS.SETTINGS_STORE_KEY, 'sk-ant-test')).resolves.not.toThrow();
    });
  });

  describe('handler registration completeness', () => {
    it('session and settings handlers register expected channels', () => {
      const registered = Array.from(handlers.keys());

      // Session handler channels
      expect(registered).toContain(IPC_CHANNELS.SESSION_START);
      expect(registered).toContain(IPC_CHANNELS.SESSION_RESUME);
      expect(registered).toContain(IPC_CHANNELS.LAUNCH_ASSESS_STATE);

      // Settings handler channels
      expect(registered).toContain(IPC_CHANNELS.SETTINGS_GET_KEY_STATE);
      expect(registered).toContain(IPC_CHANNELS.SETTINGS_STORE_KEY);
      expect(registered).toContain(IPC_CHANNELS.SETTINGS_VALIDATE_KEY);
      expect(registered).toContain(IPC_CHANNELS.SETTINGS_GET);
      expect(registered).toContain(IPC_CHANNELS.SETTINGS_SET);
      expect(registered).toContain(IPC_CHANNELS.PROFILE_GET);
      expect(registered).toContain(IPC_CHANNELS.PROFILE_SET);
      expect(registered).toContain(IPC_CHANNELS.AVATAR_SELECT);
      expect(registered).toContain(IPC_CHANNELS.AVATAR_GET_ROSTER);
      expect(registered).toContain(IPC_CHANNELS.WORKSPACE_BROWSE);
      expect(registered).toContain(IPC_CHANNELS.WORKSPACE_SET);
    });

    it('all registered channels follow namespace:verb pattern', () => {
      const pattern = /^[a-z]+:[a-z][-a-z]*$/;
      for (const channel of handlers.keys()) {
        expect(channel, `registered channel "${channel}"`).toMatch(pattern);
      }
    });
  });

  describe('message flow: renderer request to handler response', () => {
    it('simulates full flow: start session, store key, assess launch', async () => {
      // Step 1: Set up profile
      await invoke(IPC_CHANNELS.PROFILE_SET, 'TestUser');

      // Step 2: Select avatar
      await invoke(IPC_CHANNELS.AVATAR_SELECT, 'mary');

      // Step 3: Store API key
      await invoke(IPC_CHANNELS.SETTINGS_STORE_KEY, 'sk-ant-api123');

      // Step 4: Set workspace
      await invoke(IPC_CHANNELS.WORKSPACE_SET, '/projects/demo');

      // Step 5: Assess launch state -- everything should be ready
      const state = (await invoke(IPC_CHANNELS.LAUNCH_ASSESS_STATE)) as Record<string, unknown>;
      expect(state.profileComplete).toBe(true);
      expect(state.avatarSelected).toBe(true);
      expect(state.apiKeyValid).toBe(true);
      expect(state.workspaceSelected).toBe(true);

      // Step 6: Start session
      const sessionId = await invoke(IPC_CHANNELS.SESSION_START, '/projects/demo');
      expect(typeof sessionId).toBe('string');
      expect(sessionRepo.save).toHaveBeenCalledOnce();
    });
  });
});
