import { vi } from 'vitest';
import type { SessionRepository } from '../../../src/shared/types/ports/session-repository';
import type { AuditRepository } from '../../../src/shared/types/ports/audit-repository';

export function createMockSessionRepo(): SessionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByStatus: vi.fn().mockReturnValue([]),
    findByWorkspace: vi.fn().mockReturnValue([]),
    findIncomplete: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updateSdkSessionId: vi.fn(),
  };
}

export function createMockAuditRepo(): AuditRepository {
  return {
    append: vi.fn(),
    findBySession: vi.fn().mockReturnValue([]),
    findByDateRange: vi.fn().mockReturnValue([]),
  };
}
