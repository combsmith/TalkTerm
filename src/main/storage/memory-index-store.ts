import type { Database } from './database-initializer';

export interface MemoryEntry {
  id?: number;
  sessionId: string;
  memoryType: 'decision' | 'vocabulary' | 'preference';
  key: string;
  value: string;
  createdAt: string;
}

export class MemoryIndexStore {
  constructor(private readonly db: Database) {}

  save(entry: MemoryEntry): void {
    const stmt = this.db.prepare(
      'INSERT INTO memory_index (session_id, memory_type, key, value, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run(entry.sessionId, entry.memoryType, entry.key, entry.value, entry.createdAt);
  }

  findBySession(sessionId: string): MemoryEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM memory_index WHERE session_id = ? ORDER BY created_at ASC',
    );
    const rows = stmt.all(sessionId) as MemoryRow[];
    return rows.map(mapRow);
  }

  findByType(memoryType: MemoryEntry['memoryType']): MemoryEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM memory_index WHERE memory_type = ? ORDER BY created_at DESC',
    );
    const rows = stmt.all(memoryType) as MemoryRow[];
    return rows.map(mapRow);
  }

  findRecent(limit: number): MemoryEntry[] {
    const stmt = this.db.prepare('SELECT * FROM memory_index ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as MemoryRow[];
    return rows.map(mapRow);
  }
}

interface MemoryRow {
  id: number;
  session_id: string;
  memory_type: string;
  key: string;
  value: string;
  created_at: string;
}

function mapRow(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    memoryType: row.memory_type as MemoryEntry['memoryType'],
    key: row.key,
    value: row.value,
    createdAt: row.created_at,
  };
}
