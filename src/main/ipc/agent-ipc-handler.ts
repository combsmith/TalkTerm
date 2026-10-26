import {
  classifyError,
  createUserFriendlyMessage,
  recoveryOptionsForCategory,
} from '../../shared/types/domain/agent-error';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import type { AgentMessageRouter } from '../agent/agent-message-router';
import {
  cancelRouterOperations,
  enqueueRouterOperation,
  type IPCMain,
  type IPCRegistrar,
} from './ipc-registrar';
import { validateString } from './validate-string';

export interface WebContents {
  send(channel: string, ...args: unknown[]): void;
}

export class AgentIPCHandler implements IPCRegistrar {
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

        await enqueueRouterOperation(
          this.router,
          async () => {
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
          },
          { cancellable: true },
        );
      },
    );

    ipcMain.on(IPC_CHANNELS.AGENT_CANCEL, () => {
      cancelRouterOperations(this.router);
      this.router.cancel();
    });

    ipcMain.on(IPC_CHANNELS.AGENT_CONFIRM, (_event: unknown, approved: unknown) => {
      if (typeof approved !== 'boolean') {
        console.warn('[AgentIPC] Ignoring agent:confirm with non-boolean payload');
        return;
      }
      this.router.respondToConfirmation(approved);
    });
  }
}
