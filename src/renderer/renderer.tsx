import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MVP_PERSONAS } from '../shared/types/domain/avatar-persona';
import { App } from './App';
import './styles/global.css';

// Provide a standalone browser fallback when running outside Electron (e.g. Vite dev server / Playwright renderer E2E)
if (typeof (window as { electronAPI?: unknown }).electronAPI === 'undefined') {
  const noopUnsubscribe = (): (() => void) => () => {};
  window.electronAPI = {
    sendAgentMessage: () => Promise.resolve(),
    cancelAgent: () => {},
    respondToConfirmation: () => {},
    onAgentEvent: noopUnsubscribe,
    startSession: () => Promise.resolve('browser-session-id'),
    resumeSession: () => Promise.resolve(),
    validateApiKey: () => Promise.resolve({ valid: true }),
    storeApiKey: () => Promise.resolve(),
    getKeyState: () => Promise.resolve('none'),
    setAuthMode: () => Promise.resolve(),
    getAuthMode: () => Promise.resolve('api-key'),
    getProfile: () => Promise.resolve(null),
    setProfile: () => Promise.resolve(),
    getAvatarRoster: () => Promise.resolve(MVP_PERSONAS),
    selectAvatar: () => Promise.resolve(),
    browseWorkspace: () => Promise.resolve(null),
    setWorkspace: () => Promise.resolve(),
    getWorkspace: () => Promise.resolve(null),
    assessLaunchState: () =>
      Promise.resolve({
        apiKeyValid: false,
        envKeyDetected: false,
        profileComplete: false,
        avatarSelected: false,
        workspaceSelected: false,
      }),
    onAdminCheckResult: (callback) => {
      queueMicrotask(() => {
        callback({ isAdmin: true, platform: 'browser' });
      });
      return () => {};
    },
    retryAdminCheck: () => Promise.resolve({ isAdmin: true, platform: 'browser' }),
    quitApp: () => {},
    getIncompleteSessions: () => Promise.resolve([]),
    startAudioCapture: () => Promise.resolve(),
    stopAudioCapture: () => Promise.resolve(),
    sendAudioData: () => {},
    onAudioResult: noopUnsubscribe,
    onAudioError: noopUnsubscribe,
    onAudioEnd: noopUnsubscribe,
  };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
