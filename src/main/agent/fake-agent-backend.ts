import type { AgentEvent } from '../../shared/types/domain/agent-event';
import type { AgentBackend, AgentSessionConfig } from '../../shared/types/ports/agent-backend';

export class FakeAgentBackend implements AgentBackend {
  private events: AgentEvent[] = [];
  private _cancelled = false;

  queueEvents(events: AgentEvent[]): void {
    this.events = [...events];
  }

  get cancelled(): boolean {
    return this._cancelled;
  }

  *startSession(_config: AgentSessionConfig): Iterable<AgentEvent> {
    this._cancelled = false;
    for (const event of this.events) {
      if (this._cancelled as boolean) return;
      yield event;
    }
  }

  *sendMessage(
    _sessionId: string,
    _message: string,
    _workspacePath?: string,
  ): Iterable<AgentEvent> {
    this._cancelled = false;
    for (const event of this.events) {
      if (this._cancelled as boolean) return;
      yield event;
    }
  }

  cancelCurrentAction(): void {
    this._cancelled = true;
  }

  private readonly _confirmations: boolean[] = [];

  get confirmations(): readonly boolean[] {
    return this._confirmations;
  }

  respondToConfirmation(approved: boolean): void {
    this._confirmations.push(approved);
  }

  *resumeSession(_sessionId: string): Iterable<AgentEvent> {
    this._cancelled = false;
    for (const event of this.events) {
      if (this._cancelled as boolean) return;
      yield event;
    }
  }
}
