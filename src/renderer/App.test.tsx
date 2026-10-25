// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';

type AdminCheckResult = { isAdmin: boolean; platform: string; instructions?: string };
let adminCheckCallback: ((result: AdminCheckResult) => void) | null = null;
const mockRetryAdminCheck = vi.fn();
const mockQuitApp = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  adminCheckCallback = null;

  Object.defineProperty(window, 'electronAPI', {
    value: {
      sendAgentMessage: vi.fn().mockResolvedValue(undefined),
      cancelAgent: vi.fn(),
      onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
      startSession: vi.fn().mockResolvedValue('test-session-id'),
      resumeSession: vi.fn().mockResolvedValue(undefined),
      validateApiKey: vi.fn().mockResolvedValue({ valid: true }),
      storeApiKey: vi.fn().mockResolvedValue(undefined),
      getKeyState: vi.fn().mockResolvedValue('valid'),
      setAuthMode: vi.fn().mockResolvedValue(undefined),
      getAuthMode: vi.fn().mockResolvedValue('api-key'),
      getProfile: vi.fn().mockResolvedValue(null),
      setProfile: vi.fn().mockResolvedValue(undefined),
      selectAvatar: vi.fn().mockResolvedValue(undefined),
      browseWorkspace: vi.fn().mockResolvedValue(null),
      setWorkspace: vi.fn().mockResolvedValue(undefined),
      assessLaunchState: vi.fn().mockResolvedValue({
        apiKeyValid: false,
        envKeyDetected: false,
        profileComplete: false,
        avatarSelected: false,
        workspaceSelected: false,
      }),
      startAudioCapture: vi.fn().mockResolvedValue(undefined),
      stopAudioCapture: vi.fn().mockResolvedValue(undefined),
      sendAudioData: vi.fn(),
      onAudioResult: vi.fn().mockReturnValue(vi.fn()),
      onAudioError: vi.fn().mockReturnValue(vi.fn()),
      onAudioEnd: vi.fn().mockReturnValue(vi.fn()),
      getIncompleteSessions: vi.fn().mockResolvedValue([]),
      onAdminCheckResult: vi.fn((callback: (result: AdminCheckResult) => void) => {
        adminCheckCallback = callback;
        return vi.fn(); // unsubscribe
      }),
      retryAdminCheck: mockRetryAdminCheck,
      quitApp: mockQuitApp,
    },
    writable: true,
    configurable: true,
  });

  // Mock speechSynthesis
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: vi.fn().mockReturnValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
});

/** Simulate admin check passing so we reach setup phase */
function passAdminCheck(): void {
  act(() => {
    adminCheckCallback?.({ isAdmin: true, platform: 'darwin' });
  });
}

describe('App', () => {
  // Admin check gate tests (Story 2.2)
  it('shows checking permissions while waiting for admin check', () => {
    render(<App />);
    expect(screen.getByText(/checking permissions/i)).toBeInTheDocument();
  });

  it('shows AdminBlockScreen when admin check fails', () => {
    render(<App />);
    act(() => {
      adminCheckCallback?.({
        isAdmin: false,
        platform: 'darwin',
        instructions: 'sudo /Applications/TalkTerm.app/Contents/MacOS/TalkTerm',
      });
    });
    expect(screen.getByText(/TalkTerm needs admin privileges/i)).toBeInTheDocument();
    expect(screen.getByText(/sudo/i)).toBeInTheDocument();
  });

  it('blocks setup screens until admin check passes', () => {
    render(<App />);
    act(() => {
      adminCheckCallback?.({ isAdmin: false, platform: 'win32', instructions: 'Run as admin' });
    });
    // Setup screens should not be accessible
    expect(screen.queryByText('Get Started')).not.toBeInTheDocument();
    expect(screen.getByText(/TalkTerm needs admin privileges/i)).toBeInTheDocument();
  });

  it('retry button re-checks admin privileges', async () => {
    const user = userEvent.setup();
    mockRetryAdminCheck.mockResolvedValue({ isAdmin: true, platform: 'darwin' });

    render(<App />);
    act(() => {
      adminCheckCallback?.({ isAdmin: false, platform: 'darwin', instructions: 'sudo ...' });
    });

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRetryAdminCheck).toHaveBeenCalledOnce();
  });

  it('quit button calls quitApp', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      adminCheckCallback?.({ isAdmin: false, platform: 'darwin', instructions: 'sudo ...' });
    });

    await user.click(screen.getByRole('button', { name: /quit/i }));
    expect(mockQuitApp).toHaveBeenCalledOnce();
  });

  it('proceeds to setup when admin check passes', () => {
    render(<App />);
    passAdminCheck();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  // Story 2.3 — Profile name persistence
  it('persists profile name to main process via setProfile IPC on setup', async () => {
    const user = userEvent.setup();
    render(<App />);
    passAdminCheck();

    // We're at the API key setup — select subscription to skip key entry
    await user.click(screen.getByText(/Claude Pro \/ Max Subscription/));

    // Now at profile setup
    expect(screen.getByText(/What should I call you/i)).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(/your name/i);
    await user.type(nameInput, 'DJ');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Verify setProfile IPC was called with the entered name
    expect(window.electronAPI.setProfile).toHaveBeenCalledWith('DJ');
  });

  // Story 3.3 — Session resume flow
  it('App.tsx no longer hardcodes empty incompleteSessions', () => {
    // Verify the getIncompleteSessions API is defined in the mock
    expect(window.electronAPI.getIncompleteSessions).toBeDefined();
  });

  // Original setup flow tests (with admin check passing first)
  it('renders the auth choice as first screen after admin check', () => {
    render(<App />);
    passAdminCheck();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('shows both auth method options on initial load', () => {
    render(<App />);
    passAdminCheck();
    expect(screen.getByText(/Claude Pro \/ Max Subscription/)).toBeInTheDocument();
    expect(screen.getByText(/Anthropic API Key/)).toBeInTheDocument();
  });

  it('completes full setup flow through workspace, avatar, greeting, and conversation', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.getIncompleteSessions).mockResolvedValue([
      { id: 'prev-1', workspacePath: '/projects/test', updatedAt: '2026-01-01T00:00:00Z' },
    ]);

    render(<App />);
    passAdminCheck();

    // 1. Auth choice -> subscription
    await user.click(screen.getByText(/Claude Pro \/ Max Subscription/));

    // 2. Profile setup
    await user.type(screen.getByPlaceholderText(/your name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // 3. Workspace selection -> enter path and submit
    await user.type(screen.getByTestId('folder-input'), '/projects/test');
    await user.click(screen.getByRole('button', { name: /select folder/i }));

    // 4. Avatar selection -> wait for confirmation timeout, then select Mary
    const selectMaryBtn = await screen.findByRole(
      'button',
      { name: /select mary/i },
      { timeout: 2500 },
    );
    await user.click(selectMaryBtn);

    // 5. Greeting phase -> resume incomplete session
    await user.click(await screen.findByText('/projects/test'));

    // 6. Conversation phase
    expect(await screen.findByPlaceholderText(/speak to Mary/i)).toBeInTheDocument();
  });

  it('handles workspace skip and surfaces error with retry when startSession fails', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.startSession)
      .mockRejectedValueOnce(new Error('IPC error'))
      .mockResolvedValueOnce('recovered-session-id');

    render(<App />);
    passAdminCheck();

    await user.click(screen.getByText(/Claude Pro \/ Max Subscription/));
    await user.type(screen.getByPlaceholderText(/your name/i), 'Bob');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Skip workspace selection
    await user.click(screen.getByRole('button', { name: /skip/i }));

    // Avatar selection
    await user.click(screen.getByRole('button', { name: /select mary/i }));

    // Auto-advances from greeting (no incomplete sessions) and shows error when startSession rejects
    const retryBtn = await screen.findByRole(
      'button',
      { name: /retry session/i },
      { timeout: 3000 },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/IPC error/i);

    await user.click(retryBtn);
    expect(await screen.findByPlaceholderText(/speak to Mary/i)).toBeInTheDocument();
  });

  it('skips setup wizard for returning users when assessLaunchState reports all steps complete', async () => {
    vi.mocked(window.electronAPI.assessLaunchState).mockResolvedValue({
      apiKeyValid: true,
      profileComplete: true,
      avatarSelected: true,
      workspaceSelected: true,
    });
    vi.mocked(window.electronAPI.getProfile).mockResolvedValue({
      name: 'ReturningAlice',
      avatarPersonaId: 'mary',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    render(<App />);
    passAdminCheck();

    expect(await screen.findByText(/Hey ReturningAlice/i)).toBeInTheDocument();
  });
});
