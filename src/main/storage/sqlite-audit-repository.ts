import type { AuditEntry } from '../../shared/types/domain/audit-entry';
import type { AuditRepository } from '../../shared/types/ports/audit-repository';
import type { Database } from './database-initializer';

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  append(entry: AuditEntry): void {
    const stmt = this.db.prepare(
      'INSERT INTO audit_entries (session_id, timestamp, action_type, outcome, user_intent, details) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      entry.sessionId,
      entry.timestamp,
      entry.actionType,
      entry.outcome,
      entry.userIntent,
      JSON.stringify(entry.details),
    );
  }

  findBySession(sessionId: string): AuditEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM audit_entries WHERE session_id = ? ORDER BY timestamp ASC',
    );
    const rows = stmt.all(sessionId) as AuditRow[];
    return rows.map(mapRowToAuditEntry);
  }

  findByDateRange(from: string, to: string): AuditEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM audit_entries WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    );
    const rows = stmt.all(from, to) as AuditRow[];
    return rows.map(mapRowToAuditEntry);
  }
}

interface AuditRow {
  id: number;
  session_id: string;
  timestamp: string;
  action_type: string;
  outcome: string;
  user_intent: string;
  details: string;
}

function mapRowToAuditEntry(row: AuditRow): AuditEntry {
  let details: Record<string, unknown> = {};
  try {
    details = JSON.parse(row.details) as Record<string, unknown>;
  } catch (err: unknown) {
    console.error('[SqliteAuditRepository] Failed to parse audit details:', err);
    // Return empty object if JSON is malformed rather than crashing
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    actionType: row.action_type,
    outcome: row.outcome as AuditEntry['outcome'],
    userIntent: row.user_intent,
    details,
  };
}
