// IPC channel names follow the namespace:verb convention.
// Main → Renderer (streaming events)
export const IPC_CHANNELS = {
  AGENT_MESSAGE: 'agent:message',
  AGENT_ERROR: 'agent:error',
  SESSION_UPDATED: 'session:updated',

  // Renderer → Main (invoke/request)
  AGENT_ACTION: 'agent:action',
  AGENT_CANCEL: 'agent:cancel',
  /** User decision (approve/decline) for a pending tool-permission confirm-request */
  AGENT_CONFIRM: 'agent:confirm',
  SESSION_START: 'session:start',
  SESSION_RESUME: 'session:resume',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_VALIDATE_KEY: 'settings:validate-key',
  SETTINGS_STORE_KEY: 'settings:store-key',
  SETTINGS_GET_KEY_STATE: 'settings:get-key-state',
  SETTINGS_SET_AUTH_MODE: 'settings:set-auth-mode',
  SETTINGS_GET_AUTH_MODE: 'settings:get-auth-mode',
  PROFILE_GET: 'profile:get',
  PROFILE_SET: 'profile:set',
  AVATAR_GET_ROSTER: 'avatar:get-roster',
  AVATAR_SELECT: 'avatar:select',
  WORKSPACE_BROWSE: 'workspace:browse',
  WORKSPACE_SET: 'workspace:set',
  WORKSPACE_CLONE: 'workspace:clone',
  LAUNCH_ASSESS_STATE: 'launch:assess-state',
  FILE_UPLOAD_DIALOG: 'file:upload-dialog',
  AUDIT_GET_SESSION_HISTORY: 'audit:get-session-history',

  // Audio / STT (Renderer → Main invoke, Main → Renderer events)
  AUDIO_START: 'audio:start',
  AUDIO_STOP: 'audio:stop',
  AUDIO_DATA: 'audio:data',
  AUDIO_RESULT: 'audio:result',
  AUDIO_ERROR: 'audio:error',
  AUDIO_END: 'audio:end',

  // Admin check (Main → Renderer events, Renderer → Main invoke)
  ADMIN_CHECK_RESULT: 'admin:check-result',
  ADMIN_RETRY_CHECK: 'admin:retry-check',
  QUIT_APP: 'app:quit',
  SESSION_GET_INCOMPLETE: 'session:get-incomplete',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
