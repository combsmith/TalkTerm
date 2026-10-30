export interface AuditEntry {
  readonly id?: number;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly actionType: string;
  readonly outcome: 'success' | 'failure' | 'cancelled';
  readonly userIntent: string;
  readonly details: Record<string, unknown>;
}

export function createAuditEntry(
  sessionId: string,
  actionType: string,
  outcome: AuditEntry['outcome'],
  userIntent: string,
  details?: Record<string, unknown>,
): AuditEntry {
  return {
    sessionId,
    timestamp: new Date().toISOString(),
    actionType,
    outcome,
    userIntent,
    details: details ?? {},
  };
}
