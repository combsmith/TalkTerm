import { describe, it, expect } from 'vitest';
import { createAuditEntry } from './audit-entry';

describe('createAuditEntry', () => {
  it('creates an entry with all fields', () => {
    const entry = createAuditEntry('sess-1', 'tool:bash', 'success', 'run tests');
    expect(entry.sessionId).toBe('sess-1');
    expect(entry.actionType).toBe('tool:bash');
    expect(entry.outcome).toBe('success');
    expect(entry.userIntent).toBe('run tests');
    expect(entry.details).toEqual({});
  });

  it('uses ISO 8601 timestamp', () => {
    const entry = createAuditEntry('sess-1', 'tool:edit', 'success', 'edit file');
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes optional details', () => {
    const entry = createAuditEntry('sess-1', 'user:approve', 'success', 'approve plan', {
      planId: 'plan-1',
    });
    expect(entry.details).toEqual({ planId: 'plan-1' });
  });
});
