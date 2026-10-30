import type { Session, SessionStatus } from '../../shared/types/domain/session';
import type { SessionRepository } from '../../shared/types/ports/session-repository';
import type { Database } from './database-initializer';

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  save(session: Session): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO sessions (id, sdk_session_id, workspace_path, status, avatar_persona_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      session.id,
      session.sdkSessionId,
      session.workspacePath,
      session.status,
      session.avatarPersonaId,
      session.createdAt,
      session.updatedAt,
    );
  }

  findById(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as SessionRow | undefined;
    return row !== undefined ? mapRowToSession(row) : null;
  }

  findByStatus(status: SessionStatus): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE status = ?');
    const rows = stmt.all(status) as SessionRow[];
    return rows.map(mapRowToSession);
  }

  findByWorkspace(workspacePath: string): Session[] {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE workspace_path = ?');
    const rows = stmt.all(workspacePath) as SessionRow[];
    return rows.map(mapRowToSession);
  }

  findIncomplete(workspacePath: string): Session[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE workspace_path = ? AND status IN ('active', 'paused')",
    );
    const rows = stmt.all(workspacePath) as SessionRow[];
    return rows.map(mapRowToSession);
  }

  updateStatus(id: string, status: SessionStatus): void {
    const stmt = this.db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  updateSdkSessionId(id: string, sdkSessionId: string): void {
    const stmt = this.db.prepare(
      'UPDATE sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?',
    );
    stmt.run(sdkSessionId, new Date().toISOString(), id);
  }
}

interface SessionRow {
  id: string;
  sdk_session_id: string | null;
  workspace_path: string;
  status: string;
  avatar_persona_id: string;
  created_at: string;
  updated_at: string;
}

function mapRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    sdkSessionId: row.sdk_session_id,
    workspacePath: row.workspace_path,
    status: row.status as SessionStatus,
    avatarPersonaId: row.avatar_persona_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
