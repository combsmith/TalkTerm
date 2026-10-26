import type { AgentEvent } from '../../shared/types/domain/agent-event';
import type { AgentBackend, AgentSessionConfig } from '../../shared/types/ports/agent-backend';

export type AgentEventHandler = (event: AgentEvent) => void;

export class AgentMessageRouter {
  private handler: AgentEventHandler | null = null;
  private activeQueue: Promise<void> | null = null;

  constructor(private readonly backend: AgentBackend) {}

  onEvent(handler: AgentEventHandler): void {
    this.handler = handler;
  }

  private runSerialized(task: () => Promise<void>): Promise<void> {
    const current = this.activeQueue === null ? task() : this.activeQueue.then(task);
    const tracked = current
      .catch(() => undefined)
      .finally(() => {
        if (this.activeQueue === tracked) {
          this.activeQueue = null;
        }
      });
    this.activeQueue = tracked;
    return current;
  }

  startSession(config: AgentSessionConfig): Promise<void> {
    return this.runSerialized(async () => {
      for await (const event of this.backend.startSession(config)) {
        this.handler?.(event);
      }
    });
  }

  sendMessage(sessionId: string, message: string, workspacePath?: string): Promise<void> {
    return this.runSerialized(async () => {
      for await (const event of this.backend.sendMessage(sessionId, message, workspacePath)) {
        this.handler?.(event);
      }
    });
  }

  cancel(): void {
    this.backend.cancelCurrentAction();
  }

  resumeSession(sessionId: string): Promise<void> {
    return this.runSerialized(async () => {
      for await (const event of this.backend.resumeSession(sessionId)) {
        this.handler?.(event);
      }
    });
  }
}
