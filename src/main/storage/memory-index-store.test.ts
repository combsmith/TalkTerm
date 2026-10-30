/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { describe, it, expect, vi } from 'vitest';
import type { Database, Statement, RunResult } from './database-initializer';
import { MemoryIndexStore, type MemoryEntry } from './memory-index-store';

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

const mockEntry: MemoryEntry = {
  sessionId: 'sess-1',
  memoryType: 'decision',
  key: 'approach',
  value: 'incremental migration',
  createdAt: '2026-03-24T12:00:00Z',
};

const mockRow = {
  id: 1,
  session_id: 'sess-1',
  memory_type: 'decision',
  key: 'approach',
  value: 'incremental migration',
  created_at: '2026-03-24T12:00:00Z',
};

describe('MemoryIndexStore', () => {
  it('saves a memory entry', () => {
    const stmt = createMockStatement();
    const db = createMockDb(stmt);
    new MemoryIndexStore(db).save(mockEntry);
    expect(stmt.run).toHaveBeenCalledWith(
      'sess-1',
      'decision',
      'approach',
      'incremental migration',
      '2026-03-24T12:00:00Z',
    );
  });

  it('finds entries by session', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const results = new MemoryIndexStore(db).findBySession('sess-1');
    expect(results).toHaveLength(1);
    expect(results[0]?.key).toBe('approach');
  });

  it('finds entries by type', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const results = new MemoryIndexStore(db).findByType('decision');
    expect(results).toHaveLength(1);
  });

  it('finds recent entries with limit', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    new MemoryIndexStore(db).findRecent(10);
    expect(stmt.all).toHaveBeenCalledWith(10);
  });

  it('maps row to MemoryEntry correctly', () => {
    const stmt = createMockStatement([mockRow]);
    const db = createMockDb(stmt);
    const results = new MemoryIndexStore(db).findBySession('sess-1');
    expect(results[0]).toEqual({
      id: 1,
      sessionId: 'sess-1',
      memoryType: 'decision',
      key: 'approach',
      value: 'incremental migration',
      createdAt: '2026-03-24T12:00:00Z',
    });
  });
});
