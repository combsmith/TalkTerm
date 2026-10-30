import { faker } from '@faker-js/faker';
import type { Session, SessionStatus } from '../../../src/shared/types/domain/session';
import type { AuditEntry } from '../../../src/shared/types/domain/audit-entry';

export function buildSession(overrides?: Partial<Session>): Session {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    sdkSessionId: null,
    workspacePath: `/home/${faker.internet.username()}/project`,
    status: 'active' as SessionStatus,
    avatarPersonaId: 'mary',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildAuditEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return {
    sessionId: faker.string.uuid(),
    timestamp: faker.date.recent().toISOString(),
    actionType: 'tool:bash',
    outcome: 'success',
    userIntent: faker.lorem.sentence(),
    details: {},
    ...overrides,
  };
}

export function buildSessionRow(
  overrides?: Partial<{
    id: string;
    sdk_session_id: string | null;
    workspace_path: string;
    status: string;
    avatar_persona_id: string;
    created_at: string;
    updated_at: string;
  }>,
): {
  id: string;
  sdk_session_id: string | null;
  workspace_path: string;
  status: string;
  avatar_persona_id: string;
  created_at: string;
  updated_at: string;
} {
  const now = faker.date.recent().toISOString();
  return {
    id: faker.string.uuid(),
    sdk_session_id: null,
    workspace_path: `/home/${faker.internet.username()}/project`,
    status: 'active',
    avatar_persona_id: 'mary',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
