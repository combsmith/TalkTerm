import type { RecoveryOption } from './agent-error';

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; toolName: string; toolInput: Record<string, unknown> }
  | { type: 'tool-result'; toolName: string; output: string; success: boolean }
  | { type: 'confirm-request'; action: string; description: string }
  | { type: 'error'; userMessage: string; recoveryOptions: RecoveryOption[] }
  | { type: 'complete'; summary: string }
  | { type: 'progress'; step: string; status: 'pending' | 'in-progress' | 'completed' | 'failed' }
  | { type: 'suggestion'; suggestions: string[] }
  | { type: 'auth-status'; message: string }
  | { type: 'thinking'; summary: string };

export type { RecoveryOption } from './agent-error';
