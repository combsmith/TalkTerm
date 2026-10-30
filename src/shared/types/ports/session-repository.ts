import type { Session, SessionStatus } from '../domain/session';

export interface SessionRepository {
  save(session: Session): void;
  findById(id: string): Session | null;
  findByStatus(status: SessionStatus): Session[];
  findByWorkspace(workspacePath: string): Session[];
  findIncomplete(workspacePath: string): Session[];
  updateStatus(id: string, status: SessionStatus): void;
  updateSdkSessionId(id: string, sdkSessionId: string): void;
}
