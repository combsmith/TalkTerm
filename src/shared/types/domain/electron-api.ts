import type { AgentEvent } from './agent-event';
import type { AvatarPersona } from './avatar-persona';
import type { LaunchState } from './launch-state';
import type { UserProfile } from './user-profile';

export interface ElectronAPI {
  // Agent
  sendAgentMessage: (sessionId: string, message: string) => Promise<void>;
  cancelAgent: () => void;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;

  // Session
  startSession: (workspacePath: string) => Promise<string>;
  resumeSession: (sessionId: string) => Promise<void>;

  // Settings
  validateApiKey: (key: string) => Promise<{ valid: boolean; message?: string }>;
  storeApiKey: (key: string) => Promise<void>;
  getKeyState: () => Promise<'none' | 'valid' | 'expired'>;
  setAuthMode: (mode: 'api-key' | 'claude-subscription') => Promise<void>;
  getAuthMode: () => Promise<'api-key' | 'claude-subscription'>;

  // Profile
  getProfile: () => Promise<UserProfile | null>;
  setProfile: (name: string) => Promise<void>;

  // Avatar
  getAvatarRoster: () => Promise<readonly AvatarPersona[]>;
  selectAvatar: (personaId: string) => Promise<void>;

  // Workspace
  browseWorkspace: () => Promise<string | null>;
  setWorkspace: (path: string) => Promise<void>;
  getWorkspace?: () => Promise<string | null>;

  // Launch
  assessLaunchState: () => Promise<LaunchState>;

  // Admin
  onAdminCheckResult: (
    callback: (result: { isAdmin: boolean; platform: string; instructions?: string }) => void,
  ) => () => void;
  retryAdminCheck: () => Promise<{ isAdmin: boolean; platform: string; instructions?: string }>;
  quitApp: () => void;

  // Session resume
  getIncompleteSessions: (
    workspacePath: string,
  ) => Promise<Array<{ id: string; workspacePath: string; updatedAt: string }>>;

  // Audio / STT
  startAudioCapture: () => Promise<void>;
  stopAudioCapture: () => Promise<void>;
  sendAudioData: (pcmFloat32: Float32Array) => void;
  onAudioResult: (
    callback: (result: { transcript: string; isFinal: boolean }) => void,
  ) => () => void;
  onAudioError: (callback: (error: string) => void) => () => void;
  onAudioEnd: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
