import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import { createSession } from '../../shared/types/domain/session';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import type { KeyManager } from '../security/safe-storage-key-manager';
import type { ConfigStore } from '../storage/electron-config-store';
import type { IPCMain, IPCRegistrar } from './ipc-registrar';
import { validateString } from './validate-string';

export interface SessionStarter {
  startSession(config: { workspacePath: string; apiKey: string }): Promise<void>;
}

export class SessionIPCHandler implements IPCRegistrar {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly configStore: ConfigStore,
    private readonly keyManager?: KeyManager,
    private readonly agentRouter?: SessionStarter,
  ) {}

  register(ipcMain: IPCMain): void {
    ipcMain.handle(IPC_CHANNELS.SESSION_START, (_event: unknown, workspacePath: unknown) => {
      const validPath = validateString(workspacePath, 'workspacePath');
      const profile = this.configStore.get('userProfile') as
        | { avatarPersonaId: string | null }
        | undefined;
      const avatarId =
        profile !== undefined &&
        profile.avatarPersonaId !== null &&
        profile.avatarPersonaId.length > 0
          ? profile.avatarPersonaId
          : 'mary';
      const session = createSession(validPath, avatarId);
      this.sessionRepo.save(session);
      if (this.agentRouter !== undefined) {
        void this.agentRouter.startSession({
          workspacePath: validPath,
          apiKey: this.keyManager?.retrieveKey() ?? '',
        });
      }
      return session.id;
    });

    ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, (_event: unknown, sessionId: unknown) => {
      const validSessionId = validateString(sessionId, 'sessionId');
      const session = this.sessionRepo.findById(validSessionId);
      if (session === null) {
        throw new Error(`Session not found: ${validSessionId}`);
      }
      this.sessionRepo.updateStatus(session.id, 'active');
      return session;
    });

    ipcMain.handle(IPC_CHANNELS.LAUNCH_ASSESS_STATE, () => {
      const profile = this.configStore.get('userProfile') as
        | { name: string; avatarPersonaId: string | null }
        | undefined;
      // Check for API key: stored key, claude-subscription auth mode, OR ANTHROPIC_API_KEY env var
      const apiKeyEnv = process.env['ANTHROPIC_API_KEY'];
      const hasEnvKey = apiKeyEnv !== undefined && apiKeyEnv !== '';
      const hasStoredKey = this.keyManager?.hasKey() === true;
      const isSubscription = this.configStore.get('authMode') === 'claude-subscription';
      return {
        apiKeyValid: hasEnvKey || hasStoredKey || isSubscription,
        envKeyDetected: hasEnvKey,
        profileComplete: profile !== undefined && profile.name !== '',
        avatarSelected:
          profile !== undefined &&
          profile.avatarPersonaId !== null &&
          profile.avatarPersonaId !== '',
        workspaceSelected: this.configStore.has('workspacePath'),
      };
    });
  }
}
