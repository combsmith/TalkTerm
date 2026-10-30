import fs from 'node:fs';
import os from 'node:os';
import { MVP_PERSONAS } from '../../shared/types/domain/avatar-persona';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { KeyManager } from '../security/safe-storage-key-manager';
import type { ConfigStore } from '../storage/electron-config-store';
import type { IPCMain, IPCRegistrar } from './ipc-registrar';
import { validateString } from './validate-string';

export type ApiKeyVerifier = (
  key: string,
) => Promise<{ valid: boolean; message?: string }> | { valid: boolean; message?: string };

export class SettingsIPCHandler implements IPCRegistrar {
  constructor(
    private readonly keyManager: KeyManager,
    private readonly configStore: ConfigStore,
    private readonly browseDirectory: () => Promise<string | null> = () => Promise.resolve(null),
    private readonly verifyApiKey?: ApiKeyVerifier,
  ) {}

  register(ipcMain: IPCMain): void {
    ipcMain.handle(IPC_CHANNELS.SETTINGS_VALIDATE_KEY, (_event: unknown, key: unknown) => {
      const validKey = validateString(key, 'API key');
      if (validKey.startsWith('sk-ant-oat')) {
        return {
          valid: false,
          message:
            'This looks like a Claude subscription token — use the "Claude Pro/Max" option instead.',
        };
      }
      if (validKey.startsWith('sk-ant-api')) {
        if (this.verifyApiKey !== undefined) {
          return this.verifyApiKey(validKey);
        }
        return { valid: true };
      }
      return {
        valid: false,
        message: "That key didn't work — API keys start with sk-ant-api03-",
      };
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_KEY_STATE, () => {
      if (!this.keyManager.hasKey()) return 'none';
      return 'valid'; // Real validation would check against Anthropic API
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_STORE_KEY, (_event: unknown, key: unknown) => {
      const validKey = validateString(key, 'API key');
      if (validKey === 'ENV_KEY') {
        this.keyManager.deleteKey();
        return;
      }
      this.keyManager.storeKey(validKey);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_AUTH_MODE, (_event: unknown, mode: unknown) => {
      if (mode !== 'api-key' && mode !== 'claude-subscription') {
        throw new Error('Auth mode must be either "api-key" or "claude-subscription"');
      }
      this.configStore.set('authMode', mode);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_AUTH_MODE, () => {
      return this.configStore.get('authMode') ?? 'api-key';
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event: unknown, key: unknown) => {
      const validKey = validateString(key, 'Settings key');
      return this.configStore.get(validKey);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event: unknown, key: unknown, value: unknown) => {
      const validKey = validateString(key, 'Settings key');
      this.configStore.set(validKey, value);
    });

    ipcMain.handle(IPC_CHANNELS.PROFILE_GET, () => {
      return this.configStore.get('userProfile') ?? null;
    });

    ipcMain.handle(IPC_CHANNELS.PROFILE_SET, (_event: unknown, name: unknown) => {
      const validName = validateString(name, 'Profile name');
      const now = new Date().toISOString();
      const existing = this.configStore.get('userProfile') as
        | { name: string; avatarPersonaId: string | null; createdAt: string; updatedAt: string }
        | undefined;
      this.configStore.set('userProfile', {
        name: validName,
        avatarPersonaId: existing?.avatarPersonaId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    });

    ipcMain.handle(IPC_CHANNELS.AVATAR_GET_ROSTER, () => {
      return MVP_PERSONAS;
    });

    ipcMain.handle(IPC_CHANNELS.AVATAR_SELECT, (_event: unknown, personaId: unknown) => {
      const validPersonaId = validateString(personaId, 'Avatar persona ID');
      const profile = this.configStore.get('userProfile') as
        | { name: string; avatarPersonaId: string | null; createdAt: string; updatedAt: string }
        | undefined;
      if (profile === undefined) {
        throw new Error('User profile not found');
      }
      this.configStore.set('userProfile', {
        ...profile,
        avatarPersonaId: validPersonaId,
        updatedAt: new Date().toISOString(),
      });
    });

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_BROWSE, async () => {
      return this.browseDirectory();
    });

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_SET, (_event: unknown, workspacePath: unknown) => {
      if (typeof workspacePath !== 'string') {
        throw new Error('Workspace path must be a non-empty string');
      }
      const trimmedPath = workspacePath.trim();
      const validPath = trimmedPath !== '' ? trimmedPath : os.tmpdir();
      let stat: fs.Stats;
      try {
        stat = fs.statSync(validPath); // NOSONAR(tssecurity:S2083) -- intentional directory existence check for user-chosen local workspace
      } catch {
        throw new Error('Workspace directory does not exist or is not accessible');
      }
      if (!stat.isDirectory()) {
        throw new Error('Workspace path must be an existing directory');
      }
      this.configStore.set('workspacePath', validPath);
      return validPath;
    });
  }
}
