export type SessionId = string & { readonly __brand: 'SessionId' };
export type WorkspacePath = string & { readonly __brand: 'WorkspacePath' };
export type ApiKey = string & { readonly __brand: 'ApiKey' };

export function createSessionId(raw: string): SessionId {
  if (raw === '' || raw.length < 8) {
    throw new Error('Invalid session ID: must be at least 8 characters');
  }
  return raw as SessionId;
}

export function createWorkspacePath(raw: string): WorkspacePath {
  if (raw === '') {
    throw new Error('Workspace path cannot be empty');
  }
  return raw as WorkspacePath;
}

export function createApiKey(raw: string): ApiKey {
  if (raw === '') {
    throw new Error('API key cannot be empty');
  }
  return raw as ApiKey;
}
