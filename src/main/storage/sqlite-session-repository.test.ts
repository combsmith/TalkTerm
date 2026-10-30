/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { describe, it, expect, vi } from 'vitest';
import type { Session } from '../../shared/types/domain/session';
import type { Database, Statement, RunResult } from './database-initializer';
import { SqliteSessionRepository } from './sqlite-session-repository';

function createMockStatement(returnValue?: unknown): Statement {
  return {
    run: vi
      .fn<(...args: unknown[]) => RunResult>()
      .mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(returnValue),
    all: vi
      .fn<(...args: unknown[]) => unknown[]>()
      .mockReturnValue(returnValue !== undefined ? [returnValue] : []),
  };
}

function createMockDb(stmt?: Statement): Database {
  const defaultStmt = createMockStatement();
  return {
    exec: vi.fn(),
    prepare: vi.fn<(sql: string) => Statement>().mockReturnValue(stmt ?? defaultStmt),
    close: vi.fn(),
  };
}

const mockSession: Session = {
  id: 'sess-001',
  sdkSessionId: null,
  workspacePath: '/home/user/project',
  status: 'active',
  avatarPersonaId: 'mary',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
};

const mockRow = {
  id: 'sess-001',
  sdk_session_id: null,
  workspace_path: '/home/user/project',
  status: 'active',
  avatar_persona_id: 'mary',
  created_at: '2026-03-24T00:00:00.000Z',
  updated_at: '2026-03-24T00:00:00.000Z',
};

describe('SqliteSessionRepository', () => {
  it('saves a session', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    repo.save(mockSession);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE'));
    expect(stmt.run).toHaveBeenCalledWith(
      'sess-001',
      null,
      '/home/user/project',
      'active',
      'mary',
      expect.any(String),
      expect.any(String),
    );
  });

  it('finds session by id', () => {
    const stmt = createMockStatement(mockRow);
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    const result = repo.findById('sess-001');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('sess-001');
    expect(result?.workspacePath).toBe('/home/user/project');
  });

  it('returns null when session not found', () => {
    const stmt = createMockStatement(undefined);
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    expect(repo.findById('nonexistent')).toBeNull();
  });

  it('finds sessions by status', () => {
    const stmt = createMockStatement(mockRow);
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    const results = repo.findByStatus('active');
    expect(results).toHaveLength(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE status = ?'));
  });

  it('finds sessions by workspace', () => {
    const stmt = createMockStatement(mockRow);
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    const results = repo.findByWorkspace('/home/user/project');
    expect(results).toHaveLength(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE workspace_path = ?'));
  });

  it('finds incomplete sessions by workspace', () => {
    const stmt = createMockStatement(mockRow);
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    const results = repo.findIncomplete('/home/user/project');
    expect(results).toHaveLength(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("IN ('active', 'paused')"));
  });

  it('updates session status', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    repo.updateStatus('sess-001', 'completed');
    expect(stmt.run).toHaveBeenCalledWith('completed', expect.any(String), 'sess-001');
  });

  it('updates SDK session ID', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    const repo = new SqliteSessionRepository(db);
    repo.updateSdkSessionId('sess-001', 'sdk-abc');
    expect(stmt.run).toHaveBeenCalledWith('sdk-abc', expect.any(String), 'sess-001');
  });
});
