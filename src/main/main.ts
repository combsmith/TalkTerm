import path from 'node:path';
import { app, BrowserWindow, dialog, safeStorage, session, shell } from 'electron';
import { IPC_CHANNELS } from '../shared/types/domain/ipc-channels';
import type { AuthMode } from '../shared/types/ports/agent-backend';
import { AgentMessageRouter } from './agent/agent-message-router';
import { ClaudeSdkBackend } from './agent/claude-sdk-backend';
import { AgentIPCHandler } from './ipc/agent-ipc-handler';
import { SessionIPCHandler } from './ipc/session-ipc-handler';
import { SettingsIPCHandler } from './ipc/settings-ipc-handler';
import { SpeechIPCHandler } from './ipc/speech-ipc-handler';
import { checkAdminPrivileges, type AdminCheckResult } from './security/admin-check';
import { SafeStorageKeyManager } from './security/safe-storage-key-manager';
import { SherpaOnnxStt } from './speech/sherpa-onnx-stt';
import { initializeDatabase } from './storage/database-initializer';
import { ElectronConfigStore } from './storage/electron-config-store';
import { MemoryIndexStore } from './storage/memory-index-store';
import { SqliteAuditRepository } from './storage/sqlite-audit-repository';
import { SqliteSessionRepository } from './storage/sqlite-session-repository';

// Squirrel.Windows startup handling — only needed on Windows
if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron Forge requires CJS for squirrel startup
    const squirrelStartup = require('electron-squirrel-startup') as boolean;
    if (squirrelStartup) {
      app.quit();
    }
  } catch {
    // Module not available in production builds — safe to ignore on non-Windows
  }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// --- Composition Root ---
// All dependencies constructed here, wired via manual constructor injection.
// No DI framework — this is the only place where concrete implementations are created.

let mainWindow: BrowserWindow | null = null;
let cachedAdminResult: AdminCheckResult | null = null;

function isTrustedAppUrl(url: string): boolean {
  if (url.startsWith('file://')) {
    return true;
  }
  const devServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (devServerUrl !== undefined && devServerUrl !== '' && url.startsWith(devServerUrl)) {
    return true;
  }
  return false;
}

function createMainWindow(adminResult: AdminCheckResult): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'TalkTerm',
    backgroundColor: '#1A1A1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Restrict navigation and external window opening
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedAppUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Send admin check result to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.ADMIN_CHECK_RESULT, adminResult);
  });

  // Log renderer errors to stderr for debugging
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('did-fail-load:', errorCode, errorDescription);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('render-process-gone:', details);
  });

  const devServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (devServerUrl !== undefined && devServerUrl !== '') {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Force window to foreground
  mainWindow.show();
  mainWindow.focus();
  app.focus({ steal: true });

  // Ctrl+D / Cmd+D to toggle DevTools (developer/debug view)
  // Use before-input-event instead of globalShortcut for reliable packaged-app support
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'd' && (input.control || input.meta) && input.type === 'keyDown') {
      if (mainWindow?.webContents.isDevToolsOpened() === true) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
}

function bootstrap(): void {
  // 1. Admin privilege check
  const adminResult = checkAdminPrivileges();
  cachedAdminResult = adminResult;

  // 2. Initialize persistence with real better-sqlite3 and persistent config store
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module
  const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
  const envUserData = process.env['ELECTRON_USER_DATA_DIR'];
  const userDataDir =
    envUserData !== undefined && envUserData !== '' ? envUserData : app.getPath('userData');
  const dbPath = path.join(userDataDir, 'talkterm.db');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  initializeDatabase(db);
  const sessionRepo = new SqliteSessionRepository(db);
  const auditRepo = new SqliteAuditRepository(db);
  const memoryStore = new MemoryIndexStore(db);
  const configStore = new ElectronConfigStore(path.join(userDataDir, 'config.json'));

  // 3. Security — use Electron's safeStorage for API key encryption, persisted in configStore
  const keyManager = new SafeStorageKeyManager(
    {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (text: string) => safeStorage.encryptString(text),
      decryptString: (buf: Buffer) => safeStorage.decryptString(buf),
    },
    configStore,
  );

  // 4. Agent backend
  const agentBackend = new ClaudeSdkBackend(
    auditRepo,
    () => keyManager.retrieveKey(),
    (): AuthMode => {
      const mode = configStore.get('authMode');
      return mode === 'claude-subscription' ? 'claude-subscription' : 'api-key';
    },
    (): string => {
      const profile = configStore.get('userProfile') as { name?: string } | undefined;
      return profile?.name !== undefined && profile.name !== '' ? profile.name : 'User';
    },
    (): string | null => {
      const entries = memoryStore.findRecent(20);
      return entries.length > 0 ? entries.map((e) => `${e.key}: ${e.value}`).join('\n') : null;
    },
  );
  const agentRouter = new AgentMessageRouter(agentBackend);

  // 5. IPC handlers — register with ipcMain
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for ipcMain in composition root
  const { ipcMain } = require('electron') as typeof import('electron');
  const agentHandler = new AgentIPCHandler(
    agentRouter,
    () => mainWindow?.webContents ?? null,
    sessionRepo,
  );
  const settingsHandler = new SettingsIPCHandler(
    keyManager,
    configStore,
    async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async (key: string) => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.status === 401 || res.status === 403) {
          return {
            valid: false,
            message: 'That API key was rejected by Anthropic. Please check the key and try again.',
          };
        }
        return { valid: true };
      } catch {
        // Network unreachable during setup — accept valid prefix so offline setup isn't blocked
        return { valid: true };
      }
    },
  );
  const sessionHandler = new SessionIPCHandler(sessionRepo, configStore, keyManager, agentRouter);
  const sherpaOnnxStt = new SherpaOnnxStt();
  const speechHandler = new SpeechIPCHandler(sherpaOnnxStt, () => mainWindow?.webContents ?? null);
  agentHandler.register(ipcMain);
  settingsHandler.register(ipcMain);
  sessionHandler.register(ipcMain);
  speechHandler.register(ipcMain);

  // 5a. Admin check and app lifecycle IPC handlers
  ipcMain.handle(IPC_CHANNELS.ADMIN_RETRY_CHECK, () => {
    const freshResult = checkAdminPrivileges();
    cachedAdminResult = freshResult;
    return freshResult;
  });
  ipcMain.on(IPC_CHANNELS.QUIT_APP, () => {
    app.quit();
  });
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_INCOMPLETE, (_event: unknown, workspacePath: unknown) => {
    if (typeof workspacePath !== 'string' || workspacePath === '') {
      return [];
    }
    return sessionRepo.findIncomplete(workspacePath);
  });

  // 6. Grant microphone permission for Web Speech API (STT) only to trusted app URLs
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' && webContents !== null && isTrustedAppUrl(webContents.getURL())) {
      return true;
    }
    return false;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' && isTrustedAppUrl(webContents.getURL())) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // 7. Create initial window
  createMainWindow(adminResult);

  // 8. Crash-safe session persistence
  app.on('before-quit', () => {
    db.close();
  });
}

void app
  .whenReady()
  .then(() => {
    bootstrap();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && cachedAdminResult !== null) {
        createMainWindow(cachedAdminResult);
      }
    });
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to initialize app: ${msg}`);
    process.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
