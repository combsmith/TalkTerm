import {
  classifyError,
  createUserFriendlyMessage,
  recoveryOptionsForCategory,
} from '../../shared/types/domain/agent-error';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import type { AgentMessageRouter } from '../agent/agent-message-router';
import type { IPCMain, IPCRegistrar } from './ipc-registrar';
import { validateString } from './validate-string';

export interface WebContents {
  send(channel: string, ...args: unknown[]): void;
}

export class AgentIPCHandler implements IPCRegistrar {
  private readonly sessionQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly router: AgentMessageRouter,
    private readonly getWebContents: () => WebContents | null,
    private readonly sessionRepo?: SessionRepository,
  ) {}

  register(ipcMain: IPCMain): void {
    // Set up event forwarding once during registration
    this.router.onEvent((event) => {
      const webContents = this.getWebContents();
      if (webContents !== null) {
        webContents.send(IPC_CHANNELS.AGENT_MESSAGE, event);
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.AGENT_ACTION,
      async (_event: unknown, sessionId: unknown, message: unknown) => {
        const webContents = this.getWebContents();
        if (webContents === null) {
          throw new Error('No active window');
        }

        const validSessionId = validateString(sessionId, 'sessionId');
        const validMessage = validateString(message, 'message');

        const previous = this.sessionQueues.get(validSessionId) ?? Promise.resolve();
        const current = previous.then(async () => {
          try {
            const session = this.sessionRepo?.findById(validSessionId);
            const workspacePath = session?.workspacePath;
            await this.router.sendMessage(validSessionId, validMessage, workspacePath);
          } catch (err: unknown) {
            console.error('[AgentIPC] Error handling agent action:', err);
            const category = classifyError(err);
            webContents.send(IPC_CHANNELS.AGENT_MESSAGE, {
              type: 'error',
              userMessage: createUserFriendlyMessage(category),
              recoveryOptions: recoveryOptionsForCategory(category),
            });
          }
        });
        this.sessionQueues.set(validSessionId, current);
        try {
          await current;
        } finally {
          if (this.sessionQueues.get(validSessionId) === current) {
            this.sessionQueues.delete(validSessionId);
          }
        }
      },
    );

    ipcMain.on(IPC_CHANNELS.AGENT_CANCEL, () => {
      this.router.cancel();
    });
  }
}
