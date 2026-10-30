export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface Session {
  readonly id: string;
  readonly sdkSessionId: string | null;
  readonly workspacePath: string;
  readonly status: SessionStatus;
  readonly avatarPersonaId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createSession(workspacePath: string, avatarPersonaId: string): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sdkSessionId: null,
    workspacePath,
    status: 'active',
    avatarPersonaId,
    createdAt: now,
    updatedAt: now,
  };
}
