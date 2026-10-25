import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { AgentEvent, RecoveryOption } from '../../../shared/types/domain/agent-event';
import {
  parseQuestions,
  stripMarkdown,
  type QuestionSet,
} from '../../../shared/types/domain/question-parser';
import {
  detectContentType,
  isDocumentContent,
  parseClusteredContent,
  parseMarkdownTable,
  parsePlanContent,
} from '../../../shared/types/domain/render-markdown';
import type { AvatarAnimationState } from '../../hooks/useAvatarState';
import { useDisplayMode } from '../../hooks/useDisplayMode';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { IpcSpeechStt } from '../../speech/ipc-speech-stt';
import { WebSpeechTts } from '../../speech/web-speech-tts';
import { AvatarCanvas } from '../avatar/AvatarCanvas';
import { CaptionBar } from '../avatar/CaptionBar';
import { StatusIndicator } from '../avatar/StatusIndicator';
import { TextInput } from '../avatar/TextInput';
import { DocumentView } from '../display/DocumentView';
import { OutputPanel } from '../display/OutputPanel';
import type { TaskStep } from '../display/TaskProgress';
import { friendlyToolName } from '../display/TaskProgress';
import type { ActionCardData } from '../overlay/ActionCard';
import { ActionPanel } from '../overlay/ActionPanel';
import { ConfirmPlan } from '../overlay/ConfirmPlan';
import { ErrorRecovery } from '../overlay/ErrorRecovery';
import { QuestionCardStack } from './QuestionCardStack';
import { SuggestionChips } from './SuggestionChips';

/** Preferred TTS voices in priority order — first match wins */
const PREFERRED_VOICES = [
  'Google UK English Female',
  'Samantha', // macOS
  'Microsoft Zira', // Windows
  'Karen', // macOS Australian
  'Google US English',
];

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- typeof window checks needed for SSR/test safety */
function selectBestVoice(): string | undefined {
  if (typeof window === 'undefined' || window.speechSynthesis === undefined) {
    return undefined;
  }
  const voices = window.speechSynthesis.getVoices();
  for (const preferred of PREFERRED_VOICES) {
    const match = voices.find(
      (v) => v.name === preferred || v.name.includes(preferred.split(' ')[0] ?? ''),
    );
    if (match !== undefined) {
      return match.name;
    }
  }
  // Fallback: first female-sounding English voice
  const englishVoice = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Female'));
  if (englishVoice !== undefined) {
    return englishVoice.name;
  }
  return undefined;
}

interface ConversationViewProps {
  userName: string;
  avatarName: string;
  sessionId: string;
  onSetupKey?: () => void;
}

export function ConversationView({
  userName,
  avatarName,
  sessionId,
  onSetupKey,
}: ConversationViewProps): ReactElement {
  const [avatarState, setAvatarState] = useState<AvatarAnimationState>('ready');
  const [caption, setCaption] = useState<string | null>(
    `Hey ${userName}! I'm Mary, your BMAD Analyst. What are you working on today?`,
  );
  const [isCaptionVisible, setIsCaptionVisible] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sttSupported, setSttSupported] = useState(true);
  const [liveMode, setLiveMode] = useState(false);
  const [activeQuestionSet, setActiveQuestionSet] = useState<QuestionSet | null>(null);
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<{
    userMessage: string;
    recoveryOptions: RecoveryOption[];
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: string;
    description: string;
  } | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const displayMode = useDisplayMode();
  const { isOnline } = useNetworkStatus();
  const taskStepsRef = useRef<TaskStep[]>([]);
  const toolStartTimeRef = useRef(new Map<string, number>());
  /** Debounce timer for progress caption — avoids flickering on transient events */
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sttRef = useRef<IpcSpeechStt | null>(null);
  const ttsRef = useRef<WebSpeechTts | null>(null);
  const voiceRef = useRef<string | undefined>(undefined);
  const liveModeRef = useRef(false);
  /** Accumulates text events within a single agent turn for question detection */
  const pendingTextRef = useRef('');
  /** Debounce timer for text flush — allows multi-chunk responses to accumulate before parsing */
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);

  // Initialize STT and TTS instances + select voice
  useEffect(() => {
    const stt = new IpcSpeechStt();
    const tts = new WebSpeechTts();
    sttRef.current = stt;
    ttsRef.current = tts;

    // Voice list may load async — try now and on voiceschanged
    voiceRef.current = selectBestVoice();
    const handleVoicesChanged = (): void => {
      voiceRef.current = selectBestVoice();
    };
    window.speechSynthesis?.addEventListener('voiceschanged', handleVoicesChanged);

    return () => {
      stt.stop();
      tts.stop();
      window.speechSynthesis?.removeEventListener('voiceschanged', handleVoicesChanged);
    };
  }, []);

  /** Ref to startListening so flushPendingText can access it without circular deps */
  const startListeningRef = useRef<(() => void) | null>(null);

  // Barge-in: in live mode, start STT during TTS so voice can interrupt
  useEffect(() => {
    if (liveMode && avatarState === 'speaking') {
      const stt = sttRef.current;
      if (stt !== null && !stt.isListening) {
        stt.onResult = (result): void => {
          if (result.isFinal && result.transcript.trim() !== '') {
            // Voice barge-in: stop TTS and process the new input
            ttsRef.current?.stop();
            pendingTextRef.current = '';
            handleSendInternal(result.transcript.trim());
          }
        };
        stt.start();
      }
    }
  }, [liveMode, avatarState]); // eslint-disable-line react-hooks/exhaustive-deps -- handleSendInternal is stable

  // Flush accumulated text — parse as cards or display as plain text
  const flushPendingText = useCallback((): void => {
    const text = pendingTextRef.current;
    if (text === '') return;

    const parsed = parseQuestions(text);
    console.debug(
      '[ConversationView] flushing text, length=',
      text.length,
      'parsed=',
      parsed !== null ? `${String(parsed.questions.length)} items` : 'null',
    );

    if (parsed !== null) {
      pendingTextRef.current = '';
      setActiveQuestionSet(parsed);

      // If preamble is long enough for a document, show it in DocumentView
      if (isDocumentContent(parsed.preamble)) {
        setActiveDocument(parsed.preamble);
        setAvatarState('ready');
        setCaption(null);
        setIsCaptionVisible(false);
      } else {
        setAvatarState(parsed.preamble !== '' ? 'speaking' : 'ready');
        setCaption(parsed.preamble !== '' ? parsed.preamble : null);
        setIsCaptionVisible(parsed.preamble !== '');
        if (ttsRef.current !== null && parsed.preamble !== '') {
          ttsRef.current.onEnd = (): void => {
            setAvatarState('ready');
          };
          ttsRef.current.speak(parsed.preamble, voiceRef.current);
        }
      }
    } else {
      const contentType = detectContentType(text);
      if (contentType === 'document') {
        pendingTextRef.current = '';
        setActiveDocument(text);
        setAvatarState('ready');
        setCaption(null);
        setIsCaptionVisible(false);
      } else if (contentType === 'comparison-table') {
        pendingTextRef.current = '';
        displayMode.setContent({
          type: 'comparison-table',
          data: parseMarkdownTable(text),
        });
        setAvatarState('ready');
        setCaption("Here's a comparison for you.");
        setIsCaptionVisible(true);
      } else if (contentType === 'plan') {
        pendingTextRef.current = '';
        displayMode.setContent({
          type: 'plan-preview',
          data: parsePlanContent(text),
        });
        setAvatarState('ready');
        setCaption("Here's my proposed plan.");
        setIsCaptionVisible(true);
      } else if (contentType === 'clustered-cards') {
        pendingTextRef.current = '';
        displayMode.setContent({
          type: 'clustered-cards',
          data: parseClusteredContent(text),
        });
        setAvatarState('ready');
        setCaption("I've organized this into categories.");
        setIsCaptionVisible(true);
      } else {
        const content = pendingTextRef.current;
        pendingTextRef.current = '';
        setAvatarState('speaking');
        setCaption(stripMarkdown(content));
        setIsCaptionVisible(true);
        if (ttsRef.current !== null) {
          ttsRef.current.onEnd = (): void => {
            setAvatarState('ready');
            if (liveModeRef.current) {
              setTimeout(() => {
                startListeningRef.current?.();
              }, 300);
            }
          };
          ttsRef.current.speak(content, voiceRef.current);
        }
      }
    }
  }, [displayMode.setContent]); // eslint-disable-line react-hooks/exhaustive-deps -- setContent is stable (useCallback)

  // Subscribe to agent events from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAgentEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'text': {
          // Accumulate text — debounce to allow multi-chunk responses to arrive
          pendingTextRef.current =
            pendingTextRef.current !== ''
              ? `${pendingTextRef.current}\n${event.content}`
              : event.content;

          // Clear any pending flush timer
          if (flushTimerRef.current !== null) {
            clearTimeout(flushTimerRef.current);
          }

          // Show thinking state while buffering
          setAvatarState('thinking');
          setCaption(null);

          // Debounce: wait 600ms for more text to arrive before parsing/displaying
          flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            flushPendingText();
          }, 600);
          break;
        }
        case 'tool-call': {
          setAvatarState('thinking');
          setCaption(`${friendlyToolName(event.toolName)}...`);
          setIsCaptionVisible(true);
          // Track as TaskProgress step
          toolStartTimeRef.current.set(event.toolName, Date.now());
          const updatedSteps = [
            ...taskStepsRef.current.filter((s) => s.name !== event.toolName),
            { name: event.toolName, status: 'in-progress' as const },
          ];
          taskStepsRef.current = updatedSteps;
          displayMode.setContent({
            type: 'task-progress',
            data: { steps: updatedSteps },
          });
          break;
        }
        case 'tool-result': {
          setCaption(
            event.success
              ? `${friendlyToolName(event.toolName)} done`
              : `${friendlyToolName(event.toolName)} failed`,
          );
          const startTime = toolStartTimeRef.current.get(event.toolName);
          const elapsed = startTime !== undefined ? Date.now() - startTime : undefined;
          const resultSteps = taskStepsRef.current.map((s): TaskStep => {
            if (s.name === event.toolName) {
              const updated: TaskStep = {
                name: s.name,
                status: event.success ? 'completed' : 'failed',
              };
              if (elapsed !== undefined) {
                updated.elapsedMs = elapsed;
              }
              return updated;
            }
            return s;
          });
          taskStepsRef.current = resultSteps;
          displayMode.setContent({
            type: 'task-progress',
            data: { steps: resultSteps },
          });
          break;
        }
        case 'error':
          if (flushTimerRef.current !== null) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          if (progressTimerRef.current !== null) {
            clearTimeout(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          pendingTextRef.current = '';
          setAvatarState('ready');
          setCaption(event.userMessage);
          setIsCaptionVisible(true);
          if (event.recoveryOptions.length > 0) {
            setActiveError({
              userMessage: event.userMessage,
              recoveryOptions: event.recoveryOptions,
            });
          }
          // Speak error message via avatar TTS
          if (ttsRef.current !== null && event.recoveryOptions.length > 0) {
            ttsRef.current.speak(event.userMessage, voiceRef.current);
          }
          break;
        case 'complete':
          // Flush any buffered text immediately on completion
          if (flushTimerRef.current !== null) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          if (progressTimerRef.current !== null) {
            clearTimeout(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          flushPendingText();
          setAvatarState((prev) => (prev === 'speaking' ? prev : 'ready'));
          // Clear task progress tracking for next turn
          taskStepsRef.current = [];
          toolStartTimeRef.current.clear();
          break;
        case 'progress':
          // Debounce progress captions — avoids flicker when rate_limit_event is immediately
          // followed by result:success (which happens on nearly every SDK turn per logs)
          if (progressTimerRef.current !== null) {
            clearTimeout(progressTimerRef.current);
          }
          progressTimerRef.current = setTimeout(() => {
            progressTimerRef.current = null;
            setAvatarState((prev) => (prev === 'speaking' ? prev : 'thinking'));
            setCaption(event.step);
            setIsCaptionVisible(true);
          }, 300);
          break;
        case 'confirm-request':
          setAvatarState('ready');
          setCaption(`${event.description} — confirm?`);
          setIsCaptionVisible(true);
          setPendingConfirm({ action: event.action, description: event.description });
          break;
        case 'thinking':
          setAvatarState('deep-thinking');
          break;
        case 'suggestion':
          setSuggestions((prev) => [...new Set([...prev, ...event.suggestions])]);
          break;
        case 'auth-status':
          setAvatarState('thinking');
          setCaption(event.message);
          setIsCaptionVisible(true);
          break;
        /* c8 ignore next 3 */
        default:
          const _exhaustive: never = event;
          break;
      }
    });

    return () => {
      unsubscribe();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
      }
      if (progressTimerRef.current !== null) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, [flushPendingText, displayMode.setContent, displayMode.clear]); // eslint-disable-line react-hooks/exhaustive-deps -- setContent/clear are stable (useCallback)

  const startListening = useCallback((): void => {
    const stt = sttRef.current;
    if (stt === null) return;
    if (stt.isListening) return;

    stt.onResult = (result): void => {
      if (result.isFinal) {
        const text = result.transcript.trim();
        if (text !== '') {
          setInputValue('');
          setCaption(null);
          setIsCaptionVisible(false);
          handleSendInternal(text);
        }
      } else {
        setCaption(result.transcript);
        setIsCaptionVisible(true);
      }
    };

    stt.onError = (error): void => {
      if (
        error.message.includes('not supported') ||
        error.message.includes('Failed to initialize')
      ) {
        setSttSupported(false);
        setCaption('Speech recognition is not available. Please check the logs for details.');
      } else if (error.message.includes('Microphone')) {
        setCaption('Microphone access failed. Please check your system permissions.');
      } else {
        setCaption('Could not hear you clearly. Please try again.');
      }
      setLiveMode(false);
      setIsCaptionVisible(true);
      setAvatarState('ready');
    };

    stt.onEnd = (): void => {
      setAvatarState((prev) => {
        if (prev === 'listening') {
          return 'ready';
        }
        return prev;
      });
    };

    stt.start();
    setAvatarState('listening');
    setCaption('Listening...');
    setIsCaptionVisible(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- handleSendInternal is stable

  // Keep ref in sync so flushPendingText can call startListening without circular deps
  startListeningRef.current = startListening;

  /** FR37 — Stop avatar talking (barge-in). Stops TTS/STT and cancels agent. */
  function handleStopTalking(): void {
    ttsRef.current?.stop();
    sttRef.current?.stop();
    pendingTextRef.current = '';
    setLiveMode(false);
    setAvatarState('ready');
    setCaption(null);
    setIsCaptionVisible(false);
    window.electronAPI.cancelAgent();
  }

  function handleSendInternal(text: string): void {
    sttRef.current?.stop();
    ttsRef.current?.stop();
    pendingTextRef.current = '';
    taskStepsRef.current = [];
    toolStartTimeRef.current.clear();
    lastMessageRef.current = text;
    setSuggestions([]);

    setCaption(null);
    setIsCaptionVisible(false);
    setAvatarState('thinking');
    setInputValue('');
    setActiveError(null);
    displayMode.clear();

    window.electronAPI.sendAgentMessage(sessionId, text).catch(() => {
      setAvatarState('ready');
      setCaption('Something went wrong. Please try again.');
      setIsCaptionVisible(true);
    });
  }

  function handleSend(text: string): void {
    handleSendInternal(text);
  }

  /** FR59 — Submit aggregated answers from question card stack */
  function handleQuestionSubmit(aggregatedMessage: string): void {
    setActiveQuestionSet(null);
    handleSendInternal(aggregatedMessage);
  }

  /** Dismiss question card stack without submitting */
  function handleQuestionDismiss(): void {
    setActiveQuestionSet(null);
  }

  /** Handle confirmation for destructive actions (ConfirmPlan) */
  function handleConfirmApprove(): void {
    setPendingConfirm(null);
    handleSendInternal('approved');
  }
  function handleConfirmModify(): void {
    setPendingConfirm(null);
    setCaption('What would you like to change?');
    setIsCaptionVisible(true);
  }
  function handleConfirmCancel(): void {
    setPendingConfirm(null);
    window.electronAPI.cancelAgent();
    setCaption('Action cancelled.');
    setIsCaptionVisible(true);
  }

  /** Handle recovery action from ErrorRecovery panel */
  function handleRecoveryAction(action: string): void {
    setActiveError(null);
    if (action === 'retry') {
      const lastMsg = lastMessageRef.current;
      if (lastMsg !== null) {
        handleSendInternal(lastMsg);
      } else {
        setCaption('Type your message to try again.');
        setIsCaptionVisible(true);
      }
    } else if (action === 'setup-key') {
      onSetupKey?.();
    }
  }

  /** Handle menu item selection — send the chosen label to the agent */
  function handleMenuSelect(label: string): void {
    setActiveQuestionSet(null);
    handleSendInternal(label);
  }

  function handleMicClick(): void {
    if (!sttSupported) {
      setCaption('Speech recognition is not available. Check logs for details.');
      setIsCaptionVisible(true);
      return;
    }

    const stt = sttRef.current;
    if (stt === null) return;

    if (stt.isListening || liveMode) {
      stt.stop();
      setLiveMode(false);
      setAvatarState('ready');
      setCaption(null);
      setIsCaptionVisible(false);
      return;
    }

    setLiveMode(true);
    startListening();
  }

  const isTalkingOrThinking =
    avatarState === 'speaking' || avatarState === 'thinking' || avatarState === 'deep-thinking';

  return (
    <div className="flex h-screen w-screen bg-stage-bg">
      {/* Center stage */}
      <div className="flex flex-1 flex-col items-center justify-between">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <AvatarCanvas state={avatarState} />
          <StatusIndicator state={avatarState} />
          <CaptionBar text={caption} visible={isCaptionVisible} />

          {/* FR37 — Stop talking button (visible when avatar is speaking or thinking) */}
          {isTalkingOrThinking && (
            <button
              type="button"
              onClick={handleStopTalking}
              aria-label="Stop talking"
              className="rounded-lg border border-danger bg-danger/20 px-4 py-2 text-small font-medium text-danger transition-colors hover:bg-danger/40"
            >
              ⏹ Stop
            </button>
          )}

          {!sttSupported && (
            <p className="text-small text-danger">
              Speech recognition unavailable — check DevTools console for details
            </p>
          )}
          {/* Confirm plan for destructive actions */}
          {pendingConfirm !== null && (
            <div className="w-full max-w-md">
              <ConfirmPlan
                actionDescription={pendingConfirm.description}
                onApprove={handleConfirmApprove}
                onModify={handleConfirmModify}
                onCancel={handleConfirmCancel}
              />
            </div>
          )}

          {/* Error recovery panel with action cards */}
          {activeError !== null && (
            <div className="w-full max-w-md">
              <ErrorRecovery
                userMessage={activeError.userMessage}
                recoveryOptions={activeError.recoveryOptions}
                onSelect={handleRecoveryAction}
              />
            </div>
          )}

          {/* Network status warning */}
          {!isOnline && (
            <p className="text-small text-danger" role="alert">
              Connection lost — waiting for network...
            </p>
          )}

          {liveMode && avatarState !== 'speaking' && avatarState !== 'thinking' && (
            <p className="animate-pulse text-caption text-primary">
              Live mode — speak naturally, click mic to stop
            </p>
          )}
        </div>

        {/* Bottom: suggestion chips + text input + mic */}
        <div className="w-full max-w-2xl pb-6">
          {suggestions.length > 0 && (
            <div className="px-4 pb-2">
              <SuggestionChips
                suggestions={suggestions}
                selected={[]}
                onToggle={(chip) => {
                  handleSendInternal(chip);
                }}
              />
            </div>
          )}
          <TextInput
            avatarName={avatarName}
            onSend={handleSend}
            onMicClick={handleMicClick}
            isListening={avatarState === 'listening' || liveMode}
            value={inputValue}
            onValueChange={setInputValue}
          />
        </div>
      </div>

      {/* FR57-59 — Question Card Stack or Menu Panel (right panel) */}
      {activeQuestionSet !== null && (
        <div className="h-full w-[380px] shrink-0 border-l border-stage-bg">
          {activeQuestionSet.kind === 'menu' ? (
            <ActionPanel
              title={`${avatarName}'s Menu`}
              aria-label="Agent menu options"
              cards={activeQuestionSet.questions.map((q): ActionCardData => {
                // Extract description after em-dash to avoid repeating title
                const dashIdx = q.body.indexOf('—');
                const desc = dashIdx !== -1 ? q.body.slice(dashIdx + 1).trim() : '';
                return {
                  label: String(q.index),
                  title: q.title,
                  description: desc,
                };
              })}
              onSelect={(label) => {
                const idx = Number(label) - 1;
                const item = activeQuestionSet.questions[idx];
                if (item !== undefined) {
                  handleMenuSelect(item.title);
                }
              }}
            />
          ) : (
            <QuestionCardStack
              key={activeQuestionSet.questions.map((q) => q.title).join('|')}
              questionSet={activeQuestionSet}
              avatarName={avatarName}
              onSubmit={handleQuestionSubmit}
              onDismiss={handleQuestionDismiss}
            />
          )}
        </div>
      )}

      {/* OutputPanel for display modes (documents, task progress, etc.) */}
      {displayMode.mode !== 'none' && (
        <div className="h-full shrink-0 border-l border-stage-bg">
          <OutputPanel
            mode={displayMode.mode}
            data={displayMode.data}
            onClose={displayMode.clear}
          />
        </div>
      )}

      {/* Document panel for long markdown content (legacy — before OutputPanel routing) */}
      {activeDocument !== null && displayMode.mode === 'none' && (
        <div className="h-full w-[480px] shrink-0 border-l border-stage-bg bg-surface-muted">
          <DocumentView
            markdown={activeDocument}
            onDismiss={() => {
              setActiveDocument(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
