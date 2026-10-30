import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase } from '../../src/main/storage/database-initializer';
import { SqliteSessionRepository } from '../../src/main/storage/sqlite-session-repository';
import { createSession } from '../../src/shared/types/domain/session';
import type { Database as DatabaseInterface } from '../../src/main/storage/database-initializer';

/**
 * Session Lifecycle Integration Tests
 * Covers FR30 (create session), FR31 (resume session), FR32 (list resumable sessions)
 *
 * These tests exercise the real SQLite persistence layer with an in-memory database
 * to verify cross-component interactions that unit tests with mocks would miss.
 */
describe('Session Lifecycle Integration', () => {
  let db: DatabaseInterface;
  let repo: SqliteSessionRepository;

  beforeEach(() => {
    db = new Database(':memory:') as unknown as DatabaseInterface;
    initializeDatabase(db);
    repo = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a session and persists it in SQLite', () => {
    const session = createSession('/home/user/project', 'mary');
    repo.save(session);

    const found = repo.findById(session.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(session.id);
    expect(found?.workspacePath).toBe('/home/user/project');
    expect(found?.status).toBe('active');
    expect(found?.avatarPersonaId).toBe('mary');
    expect(found?.sdkSessionId).toBeNull();
    expect(found?.createdAt).toBe(session.createdAt);
  });

  it('resumes an incomplete session by updating status and SDK session ID', () => {
    const session = createSession('/home/user/project', 'mary');
    repo.save(session);

    // Pause the session
    repo.updateStatus(session.id, 'paused');
    const paused = repo.findById(session.id);
    expect(paused?.status).toBe('paused');

    // Resume it: set status back to active and assign SDK session ID
    repo.updateStatus(session.id, 'active');
    repo.updateSdkSessionId(session.id, 'sdk-session-abc');

    const resumed = repo.findById(session.id);
    expect(resumed?.status).toBe('active');
    expect(resumed?.sdkSessionId).toBe('sdk-session-abc');
    // updatedAt should be set (updateStatus writes a new timestamp)
    expect(resumed?.updatedAt).toBeDefined();
  });

  it('lists only incomplete (active/paused) sessions for a workspace', () => {
    const workspace = '/home/user/project';
    const s1 = createSession(workspace, 'mary');
    const s2 = createSession(workspace, 'alex');
    const s3 = createSession(workspace, 'mary');
    const s4 = createSession('/other/workspace', 'mary');

    repo.save(s1);
    repo.save(s2);
    repo.save(s3);
    repo.save(s4);

    // Complete s1, fail s3
    repo.updateStatus(s1.id, 'completed');
    repo.updateStatus(s3.id, 'failed');
    // Pause s2 (still incomplete)
    repo.updateStatus(s2.id, 'paused');

    const incomplete = repo.findIncomplete(workspace);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]?.id).toBe(s2.id);
    expect(incomplete[0]?.status).toBe('paused');
  });

  it('session survives simulated app restart (close and reopen DB)', () => {
    // Use a file-based temp DB to survive close/reopen cycle
    const os = require('node:os');
    const path = require('node:path');
    const fs = require('node:fs');
    const dbPath = path.join(os.tmpdir(), `talkterm-test-${crypto.randomUUID()}.db`);

    try {
      const fileDb = new Database(dbPath) as unknown as DatabaseInterface;
      initializeDatabase(fileDb);
      const fileRepo = new SqliteSessionRepository(fileDb);

      const session = createSession('/home/user/project', 'mary');
      fileRepo.save(session);
      fileRepo.updateSdkSessionId(session.id, 'sdk-123');
      fileDb.close();

      // "Restart" — open the same DB file
      const reopenedDb = new Database(dbPath) as unknown as DatabaseInterface;
      const reopenedRepo = new SqliteSessionRepository(reopenedDb);

      const found = reopenedRepo.findById(session.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(session.id);
      expect(found?.workspacePath).toBe('/home/user/project');
      expect(found?.sdkSessionId).toBe('sdk-123');

      reopenedDb.close();
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(dbPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('returns null for a non-existent session ID', () => {
    const found = repo.findById('non-existent-id');
    expect(found).toBeNull();
  });

  it('updates session status through full lifecycle: active -> paused -> active -> completed', () => {
    const session = createSession('/home/user/project', 'mary');
    repo.save(session);
    expect(repo.findById(session.id)?.status).toBe('active');

    repo.updateStatus(session.id, 'paused');
    expect(repo.findById(session.id)?.status).toBe('paused');

    repo.updateStatus(session.id, 'active');
    expect(repo.findById(session.id)?.status).toBe('active');

    repo.updateStatus(session.id, 'completed');
    expect(repo.findById(session.id)?.status).toBe('completed');

    // Completed session should not appear in incomplete list
    expect(repo.findIncomplete('/home/user/project')).toHaveLength(0);
  });

  it('finds sessions by workspace path', () => {
    const s1 = createSession('/workspace/a', 'mary');
    const s2 = createSession('/workspace/b', 'alex');
    const s3 = createSession('/workspace/a', 'mary');

    repo.save(s1);
    repo.save(s2);
    repo.save(s3);

    const workspaceA = repo.findByWorkspace('/workspace/a');
    expect(workspaceA).toHaveLength(2);
    expect(workspaceA.map((s) => s.id).sort()).toEqual([s1.id, s3.id].sort());
  });

  it('finds sessions by status', () => {
    const s1 = createSession('/workspace/a', 'mary');
    const s2 = createSession('/workspace/b', 'alex');

    repo.save(s1);
    repo.save(s2);
    repo.updateStatus(s2.id, 'paused');

    const active = repo.findByStatus('active');
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(s1.id);

    const paused = repo.findByStatus('paused');
    expect(paused).toHaveLength(1);
    expect(paused[0]?.id).toBe(s2.id);
  });
});
