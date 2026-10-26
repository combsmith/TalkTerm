export type SetupStep =
  | 'needs-key'
  | 'needs-profile'
  | 'needs-avatar'
  | 'needs-workspace'
  | 'ready';

export interface LaunchState {
  apiKeyValid: boolean;
  envKeyDetected?: boolean;
  profileComplete: boolean;
  avatarSelected: boolean;
  workspaceSelected: boolean;
  workspacePath?: string;
}

export function determineFirstIncompleteStep(state: LaunchState): SetupStep {
  if (!state.apiKeyValid) return 'needs-key';
  if (!state.profileComplete) return 'needs-profile';
  if (!state.avatarSelected) return 'needs-avatar';
  if (!state.workspaceSelected) return 'needs-workspace';
  return 'ready';
}
