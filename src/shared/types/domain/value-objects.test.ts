import { describe, it, expect } from 'vitest';
import { createSessionId, createWorkspacePath, createApiKey } from './value-objects';

describe('createSessionId', () => {
  it('creates a SessionId from a valid string', () => {
    const id = createSessionId('abcdefgh');
    expect(id).toBe('abcdefgh');
  });

  it('throws for empty string', () => {
    expect(() => createSessionId('')).toThrow('Invalid session ID');
  });

  it('throws for string shorter than 8 characters', () => {
    expect(() => createSessionId('abc')).toThrow('Invalid session ID');
  });
});

describe('createWorkspacePath', () => {
  it('creates a WorkspacePath from a valid string', () => {
    const path = createWorkspacePath('/home/user/project');
    expect(path).toBe('/home/user/project');
  });

  it('throws for empty string', () => {
    expect(() => createWorkspacePath('')).toThrow('Workspace path cannot be empty');
  });
});

describe('createApiKey', () => {
  it('creates an ApiKey from a valid string', () => {
    const key = createApiKey('sk-ant-api03-test-key');
    expect(key).toBe('sk-ant-api03-test-key');
  });

  it('throws for empty string', () => {
    expect(() => createApiKey('')).toThrow('API key cannot be empty');
  });
});
