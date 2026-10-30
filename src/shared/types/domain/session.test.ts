import { describe, it, expect } from 'vitest';
import { createSession } from './session';

describe('createSession', () => {
  it('creates a session with active status', () => {
    const session = createSession('/home/user/project', 'mary');
    expect(session.status).toBe('active');
    expect(session.workspacePath).toBe('/home/user/project');
    expect(session.avatarPersonaId).toBe('mary');
  });

  it('has null sdkSessionId initially', () => {
    const session = createSession('/tmp', 'mary');
    expect(session.sdkSessionId).toBeNull();
  });

  it('generates a unique id', () => {
    const s1 = createSession('/tmp', 'mary');
    const s2 = createSession('/tmp', 'mary');
    expect(s1.id).not.toBe(s2.id);
  });

  it('uses ISO 8601 timestamps', () => {
    const session = createSession('/tmp', 'mary');
    expect(session.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(session.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
