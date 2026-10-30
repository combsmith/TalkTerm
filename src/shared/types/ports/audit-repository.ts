import type { AuditEntry } from '../domain/audit-entry';

export interface AuditRepository {
  append(entry: AuditEntry): void;
  findBySession(sessionId: string): AuditEntry[];
  findByDateRange(from: string, to: string): AuditEntry[];
}
