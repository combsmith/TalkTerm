/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { describe, it, expect, vi } from 'vitest';
import type { AuditEntry } from '../../shared/types/domain/audit-entry';
import type { Database, Statement, RunResult } from './database-initializer';
import { SqliteAuditRepository } from './sqlite-audit-repository';

function createMockStatement(returnValue?: unknown[]): Statement {
  return {
    run: vi
      .fn<(...args: unknown[]) => RunResult>()
      .mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
    get: vi.fn(),
    all: vi.fn<(...args: unknown[]) => unknown[]>().mockReturnValue(returnValue ?? []),
  };
}

function createMockDb(stmt?: Statement): Database {
  return {
    exec: vi.fn(),
    prepare: vi.fn<(sql: string) => Statement>().mockReturnValue(stmt ?? createMockStatement()),
    close: vi.fn(),
  };
}

const mockEntry: AuditEntry = {
  sessionId: 'sess-001',
  timestamp: '2026-03-24T12:00:00.000Z',
  actionType: 'tool:bash',
  outcome: 'success',
  userIntent: 'run tests',
  details: { command: 'npm test' },
};

const mockRow = {
  id: 1,
  session_id: 'sess-001',
  timestamp: '2026-03-24T12:00:00.000Z',
  action_type: 'tool:bash',
  outcome: 'success',
  user_intent: 'run tests',
  details: '{"command":"npm test"}',
};

describe('SqliteAuditRepository', () => {
  it('appends an audit entry', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    const repo = new SqliteAuditRepository(db);
    repo.append(mockEntry);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_entries'));
    expect(stmt.run).toHaveBeenCalledWith(
      'sess-001',
      '2026-03-24T12:00:00.000Z',
      'tool:bash',
      'success',
      'run tests',
      '{"command":"npm test"}',
    );
  });

  it('finds entries by session', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const repo = new SqliteAuditRepository(db);
    const results = repo.findBySession('sess-001');
    expect(results).toHaveLength(1);
    expect(results[0]?.sessionId).toBe('sess-001');
    expect(results[0]?.details).toEqual({ command: 'npm test' });
  });

  it('finds entries by date range', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const repo = new SqliteAuditRepository(db);
    const results = repo.findByDateRange('2026-03-24T00:00:00Z', '2026-03-25T00:00:00Z');
    expect(results).toHaveLength(1);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('timestamp >= ?'));
  });

  it('orders results by timestamp ascending', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const repo = new SqliteAuditRepository(db);
    repo.findBySession('sess-001');
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY timestamp ASC'));
  });

  it('serializes details as JSON', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    const repo = new SqliteAuditRepository(db);
    repo.append(mockEntry);
    expect(stmt.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      '{"command":"npm test"}',
    );
  });
});
