import { describe, it, expect, vi } from 'vitest';
import { initializeDatabase, SCHEMA } from './database-initializer';

describe('initializeDatabase', () => {
  it('executes the schema SQL', () => {
    const db = { exec: vi.fn(), prepare: vi.fn(), close: vi.fn() };
    initializeDatabase(db);
    expect(db.exec).toHaveBeenCalledWith(SCHEMA);
  });

  it('creates sessions table', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS sessions');
  });

  it('creates audit_entries table', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS audit_entries');
  });

  it('creates memory_index table', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS memory_index');
  });

  it('creates indexes for performance', () => {
    expect(SCHEMA).toContain('CREATE INDEX IF NOT EXISTS idx_sessions_workspace');
    expect(SCHEMA).toContain('CREATE INDEX IF NOT EXISTS idx_audit_session');
    expect(SCHEMA).toContain('CREATE INDEX IF NOT EXISTS idx_audit_timestamp');
  });

  it('uses snake_case for all table and column names', () => {
    // Extract identifiers: table names from CREATE TABLE/INDEX and column names
    const tableNames = [
      ...SCHEMA.matchAll(/(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi),
    ].map((m) => m[1]);
    const columnNames = [...SCHEMA.matchAll(/^ {2,8}(\w+)\s+(?:TEXT|INTEGER|AUTOINCREMENT)/gm)].map(
      (m) => m[1],
    );
    const allIdentifiers = [...tableNames, ...columnNames];
    for (const name of allIdentifiers) {
      expect(name).not.toMatch(/[A-Z]/);
    }
  });
});
