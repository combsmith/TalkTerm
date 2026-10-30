import { vi } from 'vitest';
import type {
  Database,
  Statement,
  RunResult,
} from '../../../src/main/storage/database-initializer';

export function createMockStatement(returnValue?: unknown): Statement {
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

export function createMockDb(stmt?: Statement): Database {
  const defaultStmt = createMockStatement();
  return {
    exec: vi.fn(),
    prepare: vi.fn<(sql: string) => Statement>().mockReturnValue(stmt ?? defaultStmt),
    close: vi.fn(),
  };
}
