/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import os from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { KeyManager } from '../security/safe-storage-key-manager';
import { InMemoryConfigStore } from '../storage/electron-config-store';
import type { IPCMain } from './ipc-registrar';
import { SettingsIPCHandler } from './settings-ipc-handler';

function createMockKeyManager(hasKey = false): KeyManager {
  return {
    storeKey: vi.fn(),
    retrieveKey: vi.fn().mockReturnValue(hasKey ? 'sk-ant-test' : null),
    deleteKey: vi.fn(),
    hasKey: vi.fn().mockReturnValue(hasKey),
  };
}

describe('SettingsIPCHandler', () => {
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

  it('registers all settings channels', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    expect(handlers.has(IPC_CHANNELS.SETTINGS_VALIDATE_KEY)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SETTINGS_GET_KEY_STATE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.SETTINGS_STORE_KEY)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROFILE_GET)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROFILE_SET)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AVATAR_GET_ROSTER)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AVATAR_SELECT)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.WORKSPACE_BROWSE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.WORKSPACE_SET)).toBe(true);
  });

  it('validates API keys via SETTINGS_VALIDATE_KEY', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const validate = handlers.get(IPC_CHANNELS.SETTINGS_VALIDATE_KEY);
    expect(validate?.({}, 'sk-ant-api03-valid')).toEqual({ valid: true });
    expect(validate?.({}, 'sk-ant-oat-token')).toEqual({
      valid: false,
      message: expect.stringContaining('subscription token') as string,
    });
    expect(validate?.({}, 'bad-key')).toEqual({
      valid: false,
      message: expect.stringContaining('sk-ant-api03-') as string,
    });
  });

  it('delegates to verifyApiKey callback when provided on SETTINGS_VALIDATE_KEY', async () => {
    const verifyMock = vi
      .fn()
      .mockResolvedValueOnce({ valid: false, message: 'Invalid or revoked API key.' });
    const handler = new SettingsIPCHandler(
      createMockKeyManager(),
      new InMemoryConfigStore(),
      undefined,
      verifyMock,
    );
    handler.register(ipcMain);
    const validate = handlers.get(IPC_CHANNELS.SETTINGS_VALIDATE_KEY);
    await expect(validate?.({}, 'sk-ant-api03-revoked')).resolves.toEqual({
      valid: false,
      message: 'Invalid or revoked API key.',
    });
    expect(verifyMock).toHaveBeenCalledWith('sk-ant-api03-revoked');
  });

  it('returns MVP avatar roster and sets/browses workspace', async () => {
    const store = new InMemoryConfigStore();
    const browseMock = vi.fn().mockResolvedValue('/tmp/selected-workspace');
    const handler = new SettingsIPCHandler(createMockKeyManager(), store, browseMock);
    handler.register(ipcMain);

    const getRoster = handlers.get(IPC_CHANNELS.AVATAR_GET_ROSTER);
    const roster = getRoster?.({}) as Array<{ id: string }>;
    expect(roster.length).toBeGreaterThan(0);
    expect(roster[0]?.id).toBe('mary');

    const browse = handlers.get(IPC_CHANNELS.WORKSPACE_BROWSE);
    await expect(browse?.({})).resolves.toBe('/tmp/selected-workspace');

    const setWorkspace = handlers.get(IPC_CHANNELS.WORKSPACE_SET);
    setWorkspace?.({}, '/tmp/custom-workspace');
    expect(store.get('workspacePath')).toBe('/tmp/custom-workspace');

    // Empty workspace path (skip) resolves to and persists os.tmpdir()
    const resolvedDefault = setWorkspace?.({}, '');
    expect(resolvedDefault).toBe(os.tmpdir());
    expect(store.get('workspacePath')).toBe(os.tmpdir());
    expect(() => setWorkspace?.({}, 123)).toThrow('Workspace path must be a non-empty string');
  });

  it('returns none when no key stored', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(false), new InMemoryConfigStore());
    handler.register(ipcMain);
    const getKeyState = handlers.get(IPC_CHANNELS.SETTINGS_GET_KEY_STATE);
    expect(getKeyState?.({})).toBe('none');
  });

  it('returns valid when key is stored', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(true), new InMemoryConfigStore());
    handler.register(ipcMain);
    const getKeyState = handlers.get(IPC_CHANNELS.SETTINGS_GET_KEY_STATE);
    expect(getKeyState?.({})).toBe('valid');
  });

  it('stores API key', () => {
    const keyMgr = createMockKeyManager();
    const handler = new SettingsIPCHandler(keyMgr, new InMemoryConfigStore());
    handler.register(ipcMain);
    const storeKey = handlers.get(IPC_CHANNELS.SETTINGS_STORE_KEY);
    storeKey?.({}, 'sk-ant-test');
    expect(keyMgr.storeKey).toHaveBeenCalledWith('sk-ant-test');
  });

  it('sets and gets profile', () => {
    const store = new InMemoryConfigStore();
    const handler = new SettingsIPCHandler(createMockKeyManager(), store);
    handler.register(ipcMain);
    const getProfile = handlers.get(IPC_CHANNELS.PROFILE_GET);
    expect(getProfile?.({})).toBeNull();
    const setProfile = handlers.get(IPC_CHANNELS.PROFILE_SET);
    setProfile?.({}, 'Root');
    const profile = getProfile?.({}) as { name: string } | undefined;
    expect(profile?.name).toBe('Root');
  });

  it('throws error when storing empty API key', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const storeKey = handlers.get(IPC_CHANNELS.SETTINGS_STORE_KEY);
    expect(() => storeKey?.({}, '')).toThrow('API key must be a non-empty string');
    expect(() => storeKey?.({}, 123)).toThrow('API key must be a non-empty string');
  });

  it('sets and gets auth mode', () => {
    const store = new InMemoryConfigStore();
    const handler = new SettingsIPCHandler(createMockKeyManager(), store);
    handler.register(ipcMain);
    const setMode = handlers.get(IPC_CHANNELS.SETTINGS_SET_AUTH_MODE);
    setMode?.({}, 'claude-subscription');
    const getMode = handlers.get(IPC_CHANNELS.SETTINGS_GET_AUTH_MODE);
    expect(getMode?.({})).toBe('claude-subscription');
  });

  it('defaults to api-key when auth mode not set', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const getMode = handlers.get(IPC_CHANNELS.SETTINGS_GET_AUTH_MODE);
    expect(getMode?.({})).toBe('api-key');
  });

  it('throws error on invalid auth mode', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const setMode = handlers.get(IPC_CHANNELS.SETTINGS_SET_AUTH_MODE);
    expect(() => setMode?.({}, 'invalid')).toThrow(
      'Auth mode must be either "api-key" or "claude-subscription"',
    );
  });

  it('gets and sets generic settings', () => {
    const store = new InMemoryConfigStore();
    const handler = new SettingsIPCHandler(createMockKeyManager(), store);
    handler.register(ipcMain);
    const setSetting = handlers.get(IPC_CHANNELS.SETTINGS_SET);
    setSetting?.({}, 'customKey', 'customValue');
    const getSetting = handlers.get(IPC_CHANNELS.SETTINGS_GET);
    expect(getSetting?.({}, 'customKey')).toBe('customValue');
  });

  it('throws error when getting/setting empty setting key', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const getSetting = handlers.get(IPC_CHANNELS.SETTINGS_GET);
    const setSetting = handlers.get(IPC_CHANNELS.SETTINGS_SET);
    expect(() => getSetting?.({}, '')).toThrow('Settings key must be a non-empty string');
    expect(() => setSetting?.({}, '', 'value')).toThrow('Settings key must be a non-empty string');
    expect(() => getSetting?.({}, 123)).toThrow('Settings key must be a non-empty string');
  });

  it('throws error when setting profile with empty name', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const setProfile = handlers.get(IPC_CHANNELS.PROFILE_SET);
    expect(() => setProfile?.({}, '')).toThrow('Profile name must be a non-empty string');
    expect(() => setProfile?.({}, 123)).toThrow('Profile name must be a non-empty string');
  });

  it('selects avatar persona and updates profile', () => {
    const store = new InMemoryConfigStore();
    const handler = new SettingsIPCHandler(createMockKeyManager(), store);
    handler.register(ipcMain);
    const setProfile = handlers.get(IPC_CHANNELS.PROFILE_SET);
    setProfile?.({}, 'Alice');
    const selectAvatar = handlers.get(IPC_CHANNELS.AVATAR_SELECT);
    selectAvatar?.({}, 'persona-123');
    const getProfile = handlers.get(IPC_CHANNELS.PROFILE_GET);
    const profile = getProfile?.({}) as { avatarPersonaId: string; name: string } | undefined;
    expect(profile?.avatarPersonaId).toBe('persona-123');

    // Updating the profile name preserves the existing avatarPersonaId
    setProfile?.({}, 'Alice Updated');
    const updatedProfile = getProfile?.({}) as
      | { avatarPersonaId: string; name: string }
      | undefined;
    expect(updatedProfile?.name).toBe('Alice Updated');
    expect(updatedProfile?.avatarPersonaId).toBe('persona-123');
  });

  it('throws error when selecting avatar with empty persona ID', () => {
    const store = new InMemoryConfigStore();
    const handler = new SettingsIPCHandler(createMockKeyManager(), store);
    handler.register(ipcMain);
    const setProfile = handlers.get(IPC_CHANNELS.PROFILE_SET);
    setProfile?.({}, 'Alice');
    const selectAvatar = handlers.get(IPC_CHANNELS.AVATAR_SELECT);
    expect(() => selectAvatar?.({}, '')).toThrow('Avatar persona ID must be a non-empty string');
    expect(() => selectAvatar?.({}, 123)).toThrow('Avatar persona ID must be a non-empty string');
  });

  it('throws error when selecting avatar without profile', () => {
    const handler = new SettingsIPCHandler(createMockKeyManager(), new InMemoryConfigStore());
    handler.register(ipcMain);
    const selectAvatar = handlers.get(IPC_CHANNELS.AVATAR_SELECT);
    expect(() => selectAvatar?.({}, 'persona-123')).toThrow('User profile not found');
  });

  it('deletes any previously stored key when ENV_KEY is selected via SETTINGS_STORE_KEY', () => {
    const keyManager = createMockKeyManager(true);
    const handler = new SettingsIPCHandler(keyManager, new InMemoryConfigStore());
    handler.register(ipcMain);
    const storeKey = handlers.get(IPC_CHANNELS.SETTINGS_STORE_KEY);
    storeKey?.({}, 'ENV_KEY');
    expect(keyManager.deleteKey).toHaveBeenCalledTimes(1);
    expect(keyManager.storeKey).not.toHaveBeenCalled();
  });
});
