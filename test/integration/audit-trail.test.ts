import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/main/storage/database-initializer';
import { SqliteAuditRepository } from '../../src/main/storage/sqlite-audit-repository';
import { SqliteSessionRepository } from '../../src/main/storage/sqlite-session-repository';
import { createAuditEntry } from '../../src/shared/types/domain/audit-entry';
import { createSession } from '../../src/shared/types/domain/session';
import type { Database as DatabaseInterface } from '../../src/main/storage/database-initializer';

/**
 * Audit Trail Integration Tests
 * Covers FR27 (log agent actions), FR28 (query by session), FR29 (query by date)
 *
 * Tests the real SQLite audit repository with session repository to verify
 * foreign key relationships and query behavior across both tables.
 */
describe('Audit Trail Integration', () => {
  let db: DatabaseInterface;
  let auditRepo: SqliteAuditRepository;
  let sessionRepo: SqliteSessionRepository;

  beforeEach(() => {
    db = new Database(':memory:') as unknown as DatabaseInterface;
    initializeDatabase(db);
    auditRepo = new SqliteAuditRepository(db);
    sessionRepo = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('logs audit entries linked to a session and retrieves them', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    const entry1 = createAuditEntry(session.id, 'file:read', 'success', 'Read configuration file', {
      path: '/home/user/project/config.json',
    });
    const entry2 = createAuditEntry(session.id, 'file:write', 'success', 'Update configuration', {
      path: '/home/user/project/config.json',
      bytesWritten: 1024,
    });

    auditRepo.append(entry1);
    auditRepo.append(entry2);

    const entries = auditRepo.findBySession(session.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.actionType).toBe('file:read');
    expect(entries[1]?.actionType).toBe('file:write');
  });

  it('audit entries are queryable by session ID and isolated between sessions', () => {
    const session1 = createSession('/workspace/a', 'mary');
    const session2 = createSession('/workspace/b', 'alex');
    sessionRepo.save(session1);
    sessionRepo.save(session2);

    auditRepo.append(createAuditEntry(session1.id, 'agent:start', 'success', 'Start agent'));
    auditRepo.append(createAuditEntry(session1.id, 'file:read', 'success', 'Read file'));
    auditRepo.append(createAuditEntry(session2.id, 'agent:start', 'success', 'Start agent'));

    const s1Entries = auditRepo.findBySession(session1.id);
    const s2Entries = auditRepo.findBySession(session2.id);

    expect(s1Entries).toHaveLength(2);
    expect(s2Entries).toHaveLength(1);
  });

  it('audit entries are queryable by date range', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    // Create entries with specific timestamps
    const entry1 = {
      sessionId: session.id,
      timestamp: '2026-01-15T10:00:00.000Z',
      actionType: 'file:read',
      outcome: 'success' as const,
      userIntent: 'Read early file',
      details: {},
    };
    const entry2 = {
      sessionId: session.id,
      timestamp: '2026-01-15T12:00:00.000Z',
      actionType: 'file:write',
      outcome: 'success' as const,
      userIntent: 'Write midday file',
      details: {},
    };
    const entry3 = {
      sessionId: session.id,
      timestamp: '2026-01-15T18:00:00.000Z',
      actionType: 'agent:complete',
      outcome: 'success' as const,
      userIntent: 'Complete task',
      details: {},
    };

    auditRepo.append(entry1);
    auditRepo.append(entry2);
    auditRepo.append(entry3);

    // Query morning window only
    const morningEntries = auditRepo.findByDateRange(
      '2026-01-15T09:00:00.000Z',
      '2026-01-15T11:00:00.000Z',
    );
    expect(morningEntries).toHaveLength(1);
    expect(morningEntries[0]?.actionType).toBe('file:read');

    // Query full day
    const allEntries = auditRepo.findByDateRange(
      '2026-01-15T00:00:00.000Z',
      '2026-01-15T23:59:59.999Z',
    );
    expect(allEntries).toHaveLength(3);
  });

  it('audit entry contains all required fields: timestamp, action type, outcome, triggering intent', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    const entry = createAuditEntry(
      session.id,
      'tool:execute',
      'failure',
      'User asked to run npm install',
      { toolName: 'bash', exitCode: 1 },
    );
    auditRepo.append(entry);

    const retrieved = auditRepo.findBySession(session.id);
    expect(retrieved).toHaveLength(1);

    const stored = retrieved[0]!;
    expect(stored.id).toBeDefined();
    expect(stored.sessionId).toBe(session.id);
    expect(stored.timestamp).toBe(entry.timestamp);
    expect(stored.actionType).toBe('tool:execute');
    expect(stored.outcome).toBe('failure');
    expect(stored.userIntent).toBe('User asked to run npm install');
    expect(stored.details).toEqual({ toolName: 'bash', exitCode: 1 });
  });

  it('audit entries are returned in chronological order', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    // Insert in reverse chronological order
    auditRepo.append({
      sessionId: session.id,
      timestamp: '2026-01-15T15:00:00.000Z',
      actionType: 'third',
      outcome: 'success',
      userIntent: 'Third action',
      details: {},
    });
    auditRepo.append({
      sessionId: session.id,
      timestamp: '2026-01-15T10:00:00.000Z',
      actionType: 'first',
      outcome: 'success',
      userIntent: 'First action',
      details: {},
    });
    auditRepo.append({
      sessionId: session.id,
      timestamp: '2026-01-15T12:00:00.000Z',
      actionType: 'second',
      outcome: 'success',
      userIntent: 'Second action',
      details: {},
    });

    const entries = auditRepo.findBySession(session.id);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.actionType).toBe('first');
    expect(entries[1]?.actionType).toBe('second');
    expect(entries[2]?.actionType).toBe('third');
  });

  it('stores and retrieves complex details as JSON', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    const complexDetails = {
      files: ['/src/app.ts', '/src/main.ts'],
      metrics: { linesChanged: 42, testsAdded: 5 },
      nested: { deep: { value: true } },
    };

    auditRepo.append(
      createAuditEntry(
        session.id,
        'refactor:complete',
        'success',
        'Refactor module',
        complexDetails,
      ),
    );

    const entries = auditRepo.findBySession(session.id);
    expect(entries[0]?.details).toEqual(complexDetails);
  });

  it('handles cancelled outcome correctly', () => {
    const session = createSession('/home/user/project', 'mary');
    sessionRepo.save(session);

    auditRepo.append(
      createAuditEntry(session.id, 'agent:action', 'cancelled', 'User cancelled the operation'),
    );

    const entries = auditRepo.findBySession(session.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.outcome).toBe('cancelled');
  });
});
