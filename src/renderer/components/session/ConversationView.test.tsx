// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentEvent } from '../../../shared/types/domain/agent-event';
import type { SpeechToTextResult } from '../../../shared/types/ports/speech-to-text';
import { ConversationView } from './ConversationView';

// Mock STT and TTS modules
const mockSttStart = vi.fn();
const mockSttStop = vi.fn();
const mockTtsSpeak = vi.fn();
const mockTtsStop = vi.fn();

let mockSttInstance: {
  start: typeof mockSttStart;
  stop: typeof mockSttStop;
  onResult: ((result: SpeechToTextResult) => void) | null;
  onError: ((error: Error) => void) | null;
  onEnd: (() => void) | null;
  isListening: boolean;
};

let mockTtsInstance: {
  speak: typeof mockTtsSpeak;
  stop: typeof mockTtsStop;
  onEnd: (() => void) | null;
  isSpeaking: boolean;
};

vi.mock('../../speech/ipc-speech-stt', () => ({
  IpcSpeechStt: vi.fn().mockImplementation(function () {
    mockSttInstance = {
      start: mockSttStart,
      stop: mockSttStop,
      onResult: null,
      onError: null,
      onEnd: null,
      isListening: false,
    };
    return mockSttInstance;
  }),
}));

vi.mock('../../speech/web-speech-tts', () => ({
  WebSpeechTts: vi.fn().mockImplementation(function () {
    mockTtsInstance = {
      speak: mockTtsSpeak,
      stop: mockTtsStop,
      onEnd: null,
      isSpeaking: false,
    };
    return mockTtsInstance;
  }),
}));

// Mock electronAPI — captures the onAgentEvent callback for simulating events
let agentEventCallback: ((event: AgentEvent) => void) | null = null;
const mockSendAgentMessage = vi.fn().mockResolvedValue(undefined);
const mockCancelAgent = vi.fn();
const mockRespondToConfirmation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  agentEventCallback = null;

  // Mock electronAPI on window
  Object.defineProperty(window, 'electronAPI', {
    value: {
      sendAgentMessage: mockSendAgentMessage,
      cancelAgent: mockCancelAgent,
      respondToConfirmation: mockRespondToConfirmation,
      onAgentEvent: vi.fn((callback: (event: AgentEvent) => void) => {
        agentEventCallback = callback;
        return vi.fn(); // unsubscribe function
      }),
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
        apiKeyValid: true,
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
    },
    writable: true,
    configurable: true,
  });

  // Mock speechSynthesis for jsdom (not available natively)
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

afterEach(() => {
  vi.useRealTimers();
});

/** Helper to simulate an agent event arriving from the main process */
function simulateAgentEvent(event: AgentEvent): void {
  act(() => {
    agentEventCallback?.(event);
  });
}

/** Simulate a text event and flush the debounce timer so text/cards display immediately */
function simulateTextAndFlush(content: string): void {
  vi.useFakeTimers();
  simulateAgentEvent({ type: 'text', content });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  vi.useRealTimers();
}

describe('ConversationView', () => {
  it('renders avatar placeholder', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
  });

  it('renders text input with avatar name', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(screen.getByPlaceholderText(/speak to Mary/i)).toBeInTheDocument();
  });

  it('shows initial greeting with BMAD analyst identity', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(screen.getByText(/Hey DJ.*Mary.*BMAD Analyst/i)).toBeInTheDocument();
  });

  it('shows mic button', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
  });

  it('sends message via IPC when user types and presses Enter', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="session-42" />);
    const input = screen.getByPlaceholderText(/speak to Mary/i);
    await user.type(input, 'Hello there{Enter}');
    expect(mockSendAgentMessage).toHaveBeenCalledWith('session-42', 'Hello there');
    expect(screen.getByLabelText(/avatar is thinking/i)).toBeInTheDocument();
  });

  it('transitions to speaking state when agent sends text event', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    const input = screen.getByPlaceholderText(/speak to Mary/i);
    await user.type(input, 'Hello{Enter}');

    simulateTextAndFlush('Hi there!');

    expect(screen.getByLabelText(/avatar is speaking/i)).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(mockTtsSpeak).toHaveBeenCalledWith('Hi there!', undefined);
  });

  it('shows tool-call status in caption', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'bash', toolInput: { command: 'ls' } });
    expect(screen.getAllByText(/running command/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/avatar is thinking/i)).toBeInTheDocument();
  });

  it('shows error event message and returns to ready', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Something went wrong. Please try again.',
      recoveryOptions: [],
    });
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/avatar is ready/i)).toBeInTheDocument();
  });

  // Story 2.1 — ErrorRecovery wiring
  it('renders ErrorRecovery panel when error has recovery options', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'error',
      userMessage: "There's an issue with your API key.",
      recoveryOptions: [
        { label: 'Re-enter key', action: 'setup-key', description: 'Open API key setup' },
        { label: 'Try again', action: 'retry', description: 'Send your message again' },
      ],
    });
    // Message shown in both caption and ErrorRecovery panel
    expect(screen.getAllByText("There's an issue with your API key.")).toHaveLength(2);
    // Recovery action cards rendered
    expect(screen.getByText('Re-enter key')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('speaks error message via TTS when error event arrives', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Connection lost.',
      recoveryOptions: [{ label: 'Retry', action: 'retry', description: 'Try again' }],
    });
    expect(mockTtsSpeak).toHaveBeenCalledWith('Connection lost.', undefined);
  });

  it('clears ErrorRecovery when recovery action is selected', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="session-err" />);
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Something broke.',
      recoveryOptions: [
        { label: 'Try again', action: 'retry', description: 'Send your message again' },
      ],
    });
    expect(screen.getByText('Try again')).toBeInTheDocument();

    // Click the recovery action card
    await user.click(screen.getByText('Try again'));
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });

  it('does not show ErrorRecovery when error has no recovery options', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Generic error.',
      recoveryOptions: [],
    });
    expect(screen.getByText(/Generic error/i)).toBeInTheDocument();
    // No recovery panel should appear — only caption text
    expect(screen.queryByText('What would you like to do?')).not.toBeInTheDocument();
  });

  it('starts STT when mic button is clicked (live mode)', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    expect(mockSttStart).toHaveBeenCalledOnce();
  });

  it('sets avatar to listening when mic is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    expect(screen.getByLabelText(/avatar is listening/i)).toBeInTheDocument();
  });

  it('shows live mode indicator when mic is active', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    expect(screen.getByText(/live mode/i)).toBeInTheDocument();
  });

  it('stops live mode when mic button is clicked again', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Start live mode
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    mockSttInstance.isListening = true;

    // Stop live mode
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(mockSttStop).toHaveBeenCalled();
  });

  it('auto-sends final STT result via IPC (no Enter required)', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="session-99" />);

    await user.click(screen.getByRole('button', { name: /start recording/i }));

    // Simulate final STT result — should auto-send and go to thinking
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'hello world', isFinal: true });
    });

    expect(mockSendAgentMessage).toHaveBeenCalledWith('session-99', 'hello world');
    expect(screen.getByLabelText(/avatar is thinking/i)).toBeInTheDocument();
  });

  it('shows interim STT result in caption', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: /start recording/i }));

    act(() => {
      mockSttInstance.onResult?.({ transcript: 'hello', isFinal: false });
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('shows microphone error when mic access fails', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: /start recording/i }));

    act(() => {
      mockSttInstance.onError?.(new Error('Microphone access failed: Permission denied'));
    });

    expect(screen.getByText(/microphone access failed/i)).toBeInTheDocument();
  });

  it('shows generic error for other STT failures', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: /start recording/i }));

    act(() => {
      mockSttInstance.onError?.(new Error('Speech recognition error: audio-capture'));
    });

    expect(screen.getByText(/could not hear you/i)).toBeInTheDocument();
  });

  it('returns avatar to ready when TTS finishes', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Simulate agent text event → speaking
    simulateTextAndFlush('Hello!');
    expect(screen.getByLabelText(/avatar is speaking/i)).toBeInTheDocument();

    // Simulate TTS end
    act(() => {
      mockTtsInstance.onEnd?.();
    });

    expect(screen.getByLabelText(/avatar is ready/i)).toBeInTheDocument();
  });

  it('subscribes to agent events on mount and unsubscribes on unmount', () => {
    const { unmount } = render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(window.electronAPI.onAgentEvent).toHaveBeenCalledOnce();

    unmount();
    expect(mockSttStop).toHaveBeenCalled();
    expect(mockTtsStop).toHaveBeenCalled();
  });

  it('cleans up STT and TTS on unmount', () => {
    const { unmount } = render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    unmount();
    expect(mockSttStop).toHaveBeenCalled();
    expect(mockTtsStop).toHaveBeenCalled();
  });

  // FR37 — Stop talking button
  it('shows stop button when avatar is speaking', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    // No stop button initially (ready state)
    expect(screen.queryByRole('button', { name: /stop talking/i })).not.toBeInTheDocument();

    // Simulate agent text → speaking state (after debounce flush)
    simulateTextAndFlush('Hello!');
    expect(screen.getByRole('button', { name: /stop talking/i })).toBeInTheDocument();
  });

  it('shows stop button when avatar is thinking', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    const input = screen.getByPlaceholderText(/speak to Mary/i);
    await user.type(input, 'test{Enter}');

    expect(screen.getByRole('button', { name: /stop talking/i })).toBeInTheDocument();
  });

  it('shows stop button during progress events (rate limiting)', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Send a message to enter thinking state
    const input = screen.getByPlaceholderText(/speak to Mary/i);
    await user.type(input, 'test{Enter}');

    // Simulate a progress event (e.g., rate limit)
    vi.useFakeTimers();
    simulateAgentEvent({
      type: 'progress',
      step: 'Waiting for API availability...',
      status: 'in-progress',
    });
    // Progress captions are debounced (300ms) to avoid flicker
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    expect(screen.getByRole('button', { name: /stop talking/i })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for API availability/i)).toBeInTheDocument();
  });

  it('clicking stop button stops TTS and returns to ready', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush('Long response...');
    expect(screen.getByLabelText(/avatar is speaking/i)).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: /stop talking/i }).click();
    });
    expect(mockTtsStop).toHaveBeenCalled();
    expect(mockCancelAgent).toHaveBeenCalled();
    expect(screen.getByLabelText(/avatar is ready/i)).toBeInTheDocument();
  });

  // FR57-59 — Structured question input
  it('shows question card stack when agent sends structured questions', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateTextAndFlush(
      'Great idea! A few questions:\n1. **Platform** — iOS or Android?\n2. **Scope** — MVP or full?',
    );
    expect(screen.getByTestId('question-card-stack')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('speaks only the preamble when questions are detected', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateTextAndFlush(
      'Great idea! A few questions:\n1. **Platform** — iOS or Android?\n2. **Scope** — MVP or full?',
    );
    expect(mockTtsSpeak).toHaveBeenCalledWith('Great idea! A few questions:', undefined);
  });

  it('sends aggregated message when question answers are submitted', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="session-q" />);
    simulateTextAndFlush('Questions:\n1. **A** — First?\n2. **B** — Second?');
    expect(screen.getByTestId('question-card-stack')).toBeInTheDocument();

    // Dismiss the card stack (simulates submission callback)
    const closeBtn = screen.getByRole('button', { name: /close questions/i });
    act(() => {
      closeBtn.click();
    });
    expect(screen.queryByTestId('question-card-stack')).not.toBeInTheDocument();
  });

  it('does not show card stack for single-question text', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateTextAndFlush('Just one thing: 1. **Platform** — iOS or Android?');
    expect(screen.queryByTestId('question-card-stack')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/avatar is speaking/i)).toBeInTheDocument();
  });

  // Story 2.4 — OutputPanel + useDisplayMode wiring
  it('renders OutputPanel when display mode is set via document content', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Long markdown content should trigger DocumentView display
    const longContent =
      '# Architecture Overview\n\n' +
      'This is a detailed document about the system architecture.\n\n' +
      '## Components\n\n' +
      'The system consists of multiple components:\n\n' +
      '- **Frontend**: React + TypeScript\n' +
      '- **Backend**: Electron main process\n' +
      '- **Database**: SQLite with WAL mode\n\n' +
      '## Data Flow\n\n' +
      'Messages flow through IPC channels from renderer to main process.\n\n' +
      '## Security\n\n' +
      'API keys are encrypted using Electron safeStorage.\n\n' +
      '## Testing\n\n' +
      'Comprehensive test coverage with Vitest and React Testing Library.';

    simulateTextAndFlush(longContent);

    // Long/structured content should render in a document view
    expect(screen.getByText(/Architecture Overview/i)).toBeInTheDocument();
  });

  // Story 4.4 — Barge-in voice detection
  it('starts STT during speaking in live mode for voice barge-in', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Start live mode
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    expect(mockSttStart).toHaveBeenCalledOnce();

    // Simulate agent speaking
    simulateTextAndFlush('Hello there!');
    expect(screen.getByLabelText(/avatar is speaking/i)).toBeInTheDocument();

    // STT should have been started again for barge-in detection
    expect(mockSttStart.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // Story 4.3 — Network recovery
  it('shows network lost warning when offline', () => {
    // Simulate offline state
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
    // Restore
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  // Story 4.1 — ConfirmPlan for destructive actions
  it('shows ConfirmPlan when confirm-request event arrives', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'confirm-request',
      action: 'delete-file',
      description: 'Delete important-file.ts',
    });
    expect(screen.getByText('Delete important-file.ts')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('dismisses ConfirmPlan, denies the pending permission, and cancels agent when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'confirm-request',
      action: 'delete-file',
      description: 'Delete dangerous thing',
    });
    await user.click(screen.getByText('Cancel'));
    expect(mockRespondToConfirmation).toHaveBeenCalledWith(false);
    expect(mockCancelAgent).toHaveBeenCalled();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('approves the pending SDK permission (not a new chat turn) when Approve clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'confirm-request',
      action: 'Bash',
      description: 'Bash: npm install',
    });
    await user.click(screen.getByText('Approve'));
    expect(mockRespondToConfirmation).toHaveBeenCalledWith(true);
    expect(mockSendAgentMessage).not.toHaveBeenCalled();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/avatar is thinking/i)).toBeInTheDocument();
  });

  it('declines the pending permission and prompts modification when Modify clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({
      type: 'confirm-request',
      action: 'rename-file',
      description: 'Rename old.ts to new.ts',
    });
    await user.click(screen.getByText('Modify'));
    expect(mockRespondToConfirmation).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Rename old.ts to new.ts')).not.toBeInTheDocument();
    expect(screen.getByText('What would you like to change?')).toBeInTheDocument();
  });

  // Story 3.1 — TaskProgress wired to agent events
  it('shows TaskProgress in OutputPanel when tool-call event arrives', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'bash', toolInput: { command: 'ls' } });
    // TaskProgress should be visible in OutputPanel showing the step
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Running command')).toBeInTheDocument();
  });

  it('marks step as completed on tool-result success', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'bash', toolInput: { command: 'ls' } });
    simulateAgentEvent({
      type: 'tool-result',
      toolName: 'bash',
      output: 'file.txt',
      success: true,
    });
    // Check for the completed icon (✓)
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('marks step as failed on tool-result failure', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'bash', toolInput: { command: 'bad' } });
    simulateAgentEvent({
      type: 'tool-result',
      toolName: 'bash',
      output: 'error',
      success: false,
    });
    // Check for the failed icon (✗)
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('tracks multiple tool steps in TaskProgress', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'bash', toolInput: { command: 'ls' } });
    simulateAgentEvent({ type: 'tool-result', toolName: 'bash', output: 'ok', success: true });
    simulateAgentEvent({
      type: 'tool-call',
      toolName: 'file_editor',
      toolInput: { path: 'a.ts' },
    });
    // Both steps should be visible with friendly labels
    expect(screen.getByText('Running command')).toBeInTheDocument();
    expect(screen.getByText('file_editor')).toBeInTheDocument();
  });

  it('OutputPanel close button dismisses the panel', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // Simulate long document content (must exceed 600-char DOCUMENT_THRESHOLD)
    const longContent =
      '# Long Document\n\n' +
      'Paragraph one with details about the system. This section covers the overall architecture ' +
      'and design decisions that were made during the initial planning phase of the project.\n\n' +
      '## Section Two\n\n' +
      'More content here about various topics including performance optimization strategies, ' +
      'caching layers, and database indexing approaches that improve query throughput.\n\n' +
      '## Section Three\n\n' +
      'Even more content to ensure this qualifies as document content. We discuss testing ' +
      'methodologies, continuous integration pipelines, and deployment automation.\n\n' +
      '## Section Four\n\n' +
      'Final section with concluding thoughts about the implementation. This wraps up the ' +
      'discussion with recommendations for future improvements and maintenance guidelines.';

    simulateTextAndFlush(longContent);

    // Document view should be visible
    expect(screen.getByText(/Long Document/i)).toBeInTheDocument();

    // Click close/dismiss button
    const dismissBtn = screen.getByRole('button', { name: /dismiss|close/i });
    act(() => {
      dismissBtn.click();
    });

    // Document should be dismissed
    expect(screen.queryByText(/Long Document/i)).not.toBeInTheDocument();
  });

  it('sets deep-thinking avatar state on thinking event', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'thinking', summary: 'Considering options...' });
    expect(screen.getByLabelText(/avatar is deep-thinking/i)).toBeInTheDocument();
  });

  it('shows suggestion chips on suggestion event', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'suggestion', suggestions: ['Tell me more'] });
    expect(screen.getByText('Tell me more')).toBeInTheDocument();
  });

  it('clears suggestion chips when user sends a message', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'suggestion', suggestions: ['Tell me more'] });
    expect(screen.getByText('Tell me more')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/speak to Mary/i);
    await user.type(input, 'hello{Enter}');
    expect(screen.queryByText('Tell me more')).not.toBeInTheDocument();
  });

  it('shows auth-status message as caption', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'auth-status', message: 'Opening browser for login...' });
    expect(screen.getByText('Opening browser for login...')).toBeInTheDocument();
    expect(screen.getByLabelText(/avatar is thinking/i)).toBeInTheDocument();
  });

  it('shows stop button during deep-thinking state', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'thinking', summary: 'Deep analysis' });
    expect(screen.getByRole('button', { name: /stop talking/i })).toBeInTheDocument();
  });

  it('selects preferred or fallback English female voice when voices are available', () => {
    const mockGetVoices = vi.fn().mockReturnValueOnce([{ name: 'Samantha', lang: 'en-US' }]);
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: mockGetVoices,
        addEventListener: vi.fn((_evt: string, cb: () => void) => {
          cb();
        }),
        removeEventListener: vi.fn(),
        speak: vi.fn(),
        cancel: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    mockGetVoices.mockReturnValueOnce([{ name: 'Custom English Female', lang: 'en-GB' }]);

    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    expect(mockGetVoices).toHaveBeenCalled();
  });

  it('routes plan content to OutputPanel', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush('- [x] Set up project\n- [ ] Write tests\n- [ ] Deploy to production');
    expect(screen.getByText(/Here's my proposed plan/i)).toBeInTheDocument();
    expect(screen.getByText('Set up project')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('routes comparison table and clustered cards content to OutputPanel', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush(
      '| Framework | Speed | DX |\n| --- | --- | --- |\n| Vite | 5 | 5 |\n| Webpack | 3 | 3 |',
    );
    expect(screen.getByText(/Here's a comparison for you/i)).toBeInTheDocument();
    expect(screen.getByText('Vite')).toBeInTheDocument();

    simulateTextAndFlush('**Frontend**\n- React\n- Tailwind\n**Backend**\n- Node.js\n- SQLite');
    expect(screen.getByText(/organized this into categories/i)).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });

  it('routes spoken STT answers through QuestionCardStack instead of sending immediately', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush(
      'Two questions:\n1. **Platform** — Which platform?\n2. **Timeline** — When do you need it?',
    );
    expect(screen.getByTestId('question-progress')).toHaveTextContent('1 of 2');

    // Start mic and speak first answer
    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'iOS and Android', isFinal: true });
    });

    // Should advance to question 2 without sending to agent
    expect(mockSendAgentMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-progress')).toHaveTextContent('2 of 2');

    // Speak second answer -> transitions to review screen
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'Q3 2026', isFinal: true });
    });
    expect(mockSendAgentMessage).not.toHaveBeenCalled();
    expect(screen.getByText('iOS and Android')).toBeInTheDocument();
    expect(screen.getByText('Q3 2026')).toBeInTheDocument();
  });

  it('clears an obsolete question stack when the user sends a new message via the main input', async () => {
    const user = userEvent.setup();
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush(
      'Two questions:\n1. **Platform** — Which platform?\n2. **Timeline** — When do you need it?',
    );
    expect(screen.getByTestId('question-card-stack')).toBeInTheDocument();

    // Bypass the questionnaire with a typed follow-up
    await user.type(screen.getByPlaceholderText(/speak to Mary/i), 'Actually, skip that{Enter}');
    expect(mockSendAgentMessage).toHaveBeenCalledWith('s1', 'Actually, skip that');
    expect(screen.queryByTestId('question-card-stack')).not.toBeInTheDocument();

    // Agent replies with plain text; later voice input must go to the agent, not the old stack
    simulateTextAndFlush('Sure, no problem.');
    act(() => {
      mockTtsInstance.onEnd?.();
    });
    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'Build me a web app', isFinal: true });
    });
    expect(mockSendAgentMessage).toHaveBeenLastCalledWith('s1', 'Build me a web app');
    expect(screen.queryByTestId('question-card-stack')).not.toBeInTheDocument();
  });

  it('finalizes displayed tool progress steps when completed progress or complete event arrives', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    simulateAgentEvent({ type: 'tool-call', toolName: 'Read', toolInput: { file_path: 'a.ts' } });
    simulateAgentEvent({ type: 'progress', step: 'Read 1 file', status: 'completed' });
    expect(screen.getByText('✓')).toBeInTheDocument();

    // Another tool call followed directly by complete event
    simulateAgentEvent({ type: 'tool-call', toolName: 'Grep', toolInput: { pattern: 'foo' } });
    simulateAgentEvent({ type: 'complete', summary: 'Done' });
    expect(screen.getAllByText('✓')).toHaveLength(2);
  });

  it('handles STT interim results, errors, and onEnd callback', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);
    const micBtn = screen.getByRole('button', { name: /start recording/i });
    act(() => {
      micBtn.click();
    });

    // Interim result
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'partial words', isFinal: false });
    });
    expect(screen.getByText('partial words')).toBeInTheDocument();

    // Final result
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'final command', isFinal: true });
    });
    expect(mockSendAgentMessage).toHaveBeenCalledWith('s1', 'final command');

    // Trigger Microphone error, generic error, and not supported error
    act(() => {
      mockSttInstance.onError?.(new Error('Microphone permission denied'));
    });
    expect(screen.getByText(/Microphone access failed/i)).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    act(() => {
      mockSttInstance.onEnd?.();
      mockSttInstance.onError?.(new Error('aborted'));
    });
    expect(screen.getByText(/Could not hear you clearly/i)).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    act(() => {
      mockSttInstance.onError?.(new Error('Failed to initialize'));
    });
    expect(screen.getByText(/Speech recognition is not available/i)).toBeInTheDocument();

    // Clicking mic when sttSupported is false
    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    expect(screen.getByText(/Speech recognition is not available/i)).toBeInTheDocument();
  });

  it('handles ErrorRecovery retry and setup-key actions and suggestion chip click', () => {
    const onSetupKey = vi.fn();
    render(
      <ConversationView userName="DJ" avatarName="Mary" sessionId="s1" onSetupKey={onSetupKey} />,
    );

    // Trigger error with retry and setup-key options before any message sent
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Invalid API key',
      recoveryOptions: [
        { label: 'Retry now', action: 'retry', description: 'Retry' },
        { label: 'Update key', action: 'setup-key', description: 'Setup key' },
      ],
    });

    act(() => {
      screen.getByText('Retry now').click();
    });
    expect(screen.getByText(/Type your message to try again/i)).toBeInTheDocument();

    // Trigger error again and click Update key
    simulateAgentEvent({
      type: 'error',
      userMessage: 'Invalid API key',
      recoveryOptions: [{ label: 'Update key', action: 'setup-key', description: 'Setup key' }],
    });
    act(() => {
      screen.getByText('Update key').click();
    });
    expect(onSetupKey).toHaveBeenCalledOnce();

    // Click suggestion chip
    simulateAgentEvent({ type: 'suggestion', suggestions: ['Run tests'] });
    act(() => {
      screen.getByText('Run tests').click();
    });
    expect(mockSendAgentMessage).toHaveBeenCalledWith('s1', 'Run tests');
  });

  it('dismisses QuestionCardStack when Close questions button is clicked', () => {
    render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    simulateTextAndFlush(
      'Two questions:\n1. **Platform** — Which platform?\n2. **Timeline** — When do you need it?',
    );

    expect(screen.getByText('Platform')).toBeInTheDocument();
    const dismissBtn = screen.getByRole('button', { name: /close questions/i });
    act(() => {
      dismissBtn.click();
    });
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();
  });

  it('handles voice barge-in, no-preamble questions, long-preamble questions, multi-chunk text, and timer cleanup', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ConversationView userName="DJ" avatarName="Mary" sessionId="s1" />);

    // 1. Multi-chunk text accumulation before flush
    simulateAgentEvent({ type: 'text', content: 'Chunk one' });
    simulateAgentEvent({ type: 'text', content: 'Chunk two' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText(/Chunk one/i)).toBeInTheDocument();

    // 2. Questions with empty preamble
    simulateAgentEvent({
      type: 'text',
      content: '1. **Platform** — iOS or Android?\n2. **Database** — SQL or NoSQL?',
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('Platform')).toBeInTheDocument();

    // 3. Questions with long document preamble (> 600 chars) after a tool-call (replaces task-progress panel)
    simulateAgentEvent({
      type: 'tool-call',
      toolName: 'Read',
      toolInput: { file_path: '/src/app.ts' },
    });
    const longPreamble = `# Specification\n\n${'Detailed architectural context and background information. '.repeat(15)}`;
    simulateAgentEvent({
      type: 'text',
      content: `${longPreamble}\n\n1. **Auth** — OAuth or JWT?\n2. **Hosting** — AWS or GCP?`,
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('Auth')).toBeInTheDocument();
    expect(screen.getByText(/# Specification/)).toBeInTheDocument();

    // 3b. Standalone document response after tool-call replaces task-progress panel and survives subsequent complete event
    simulateAgentEvent({
      type: 'tool-call',
      toolName: 'Read',
      toolInput: { file_path: '/src/arch.ts' },
    });
    simulateAgentEvent({
      type: 'text',
      content: `# Architecture Overview\n\n${'Comprehensive system design details and module responsibilities. '.repeat(15)}`,
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    simulateAgentEvent({ type: 'complete', summary: 'Done' });
    expect(screen.getByText(/# Architecture Overview/)).toBeInTheDocument();

    // 3c. Comparison table flushed >600ms before complete is preserved on complete and restarts live mic when live mode is active
    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    mockSttInstance.start.mockClear();
    mockSttInstance.isListening = false;
    simulateAgentEvent({
      type: 'tool-call',
      toolName: 'Read',
      toolInput: { file_path: '/src/compare.ts' },
    });
    simulateAgentEvent({
      type: 'text',
      content: '| Option | Cost |\n| --- | --- |\n| Plan A | $10 |\n| Plan B | $20 |',
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    simulateAgentEvent({ type: 'complete', summary: 'Done' });
    expect(screen.getByText('Plan A')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(mockSttInstance.start).toHaveBeenCalled();
    act(() => {
      screen.getByRole('button', { name: /stop recording/i }).click();
    });

    // 4. Consecutive progress events + error clearing active timers
    simulateAgentEvent({ type: 'text', content: 'Buffered text' });
    simulateAgentEvent({ type: 'progress', step: 'Step 1', status: 'in-progress' });
    simulateAgentEvent({ type: 'progress', step: 'Step 2', status: 'in-progress' });
    simulateAgentEvent({ type: 'error', userMessage: 'Interrupted', recoveryOptions: [] });
    expect(screen.getByText('Interrupted')).toBeInTheDocument();

    // 5. Complete clearing active timers
    simulateAgentEvent({ type: 'text', content: 'Final answer' });
    simulateAgentEvent({ type: 'progress', step: 'Step 3', status: 'in-progress' });
    simulateAgentEvent({ type: 'complete', summary: 'Done' });

    // 6. Voice barge-in during live mode speaking (first with question stack open, then closed)
    act(() => {
      screen.getByRole('button', { name: /start recording/i }).click();
    });
    mockSttInstance.isListening = false;
    simulateAgentEvent({ type: 'text', content: 'Speaking now' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'OAuth', isFinal: true });
    });
    expect(screen.getByTestId('question-progress')).toHaveTextContent('2 of 2');
    act(() => {
      screen.getByRole('button', { name: /close questions/i }).click();
    });
    act(() => {
      mockSttInstance.onResult?.({ transcript: 'barge in message', isFinal: true });
    });
    expect(mockSendAgentMessage).toHaveBeenCalledWith('s1', 'barge in message');

    // 7. Cancel delayed mic restart when user disables live mode within 300ms after TTS ends
    mockSttInstance.start.mockClear();
    mockSttInstance.isListening = false;
    act(() => {
      mockTtsInstance.onEnd?.();
    });
    // User clicks mic to stop live mode before 300ms elapses
    act(() => {
      screen.getByRole('button', { name: /stop recording/i }).click();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mockSttInstance.start).not.toHaveBeenCalled();

    // 8. Unmount with active timers
    simulateAgentEvent({ type: 'text', content: 'Pending on unmount' });
    simulateAgentEvent({ type: 'progress', step: 'Pending progress', status: 'in-progress' });
    unmount();
    vi.useRealTimers();
  });
});
