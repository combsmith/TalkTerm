import type { AgentEvent } from '../domain/agent-event';

export type AuthMode = 'api-key' | 'claude-subscription';

export interface AgentSessionConfig {
  sessionId?: string;
  workspacePath: string;
  apiKey: string;
  authMode?: AuthMode;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export interface AgentBackend {
  startSession(config: AgentSessionConfig): AsyncIterable<AgentEvent> | Iterable<AgentEvent>;
  sendMessage(
    sessionId: string,
    message: string,
    workspacePath?: string,
  ): AsyncIterable<AgentEvent> | Iterable<AgentEvent>;
  cancelCurrentAction(): void;
  resumeSession(sessionId: string): AsyncIterable<AgentEvent> | Iterable<AgentEvent>;
}
