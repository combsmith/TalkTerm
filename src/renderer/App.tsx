import { useEffect, useState, type ReactElement } from 'react';
import { determineFirstIncompleteStep } from '../shared/types/domain/launch-state';
import { ConversationView } from './components/session/ConversationView';
import { SessionGreeting } from './components/session/SessionGreeting';
import { AdminBlockScreen } from './components/setup/AdminBlockScreen';
import { ApiKeySetup } from './components/setup/ApiKeySetup';
import { AvatarSelection } from './components/setup/AvatarSelection';
import { ProfileSetup } from './components/setup/ProfileSetup';
import { WorkspaceSelection } from './components/setup/WorkspaceSelection';
import { useSetupRouter } from './hooks/useSetupRouter';

type AppPhase = 'admin-check' | 'setup' | 'greeting' | 'conversation';

interface AdminCheckResult {
  isAdmin: boolean;
  platform: string;
  instructions?: string;
}

export function App(): ReactElement | null {
  const { currentStep, goToStep, completeCurrentStep } = useSetupRouter('needs-key');
  const [userName, setUserName] = useState('');
  const [phase, setPhase] = useState<AppPhase>('admin-check');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [recoveringKey, setRecoveringKey] = useState(false);
  const [workspacePath, setWorkspacePath] = useState('');
  const [envKeyDetected, setEnvKeyDetected] = useState(false);
  const [adminResult, setAdminResult] = useState<AdminCheckResult | null>(null);
  const [incompleteSessions, setIncompleteSessions] = useState<
    Array<{ id: string; workspacePath: string; updatedAt: string }>
  >([]);

  // Listen for admin check result from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.onAdminCheckResult((result: AdminCheckResult) => {
      setAdminResult(result);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  async function startNewSession(): Promise<void> {
    setSessionError(null);
    try {
      const id = await window.electronAPI.startSession(workspacePath);
      setSessionId(id);
      setPhase('conversation');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start session';
      setSessionError(message);
    }
  }

  // Handle admin check completion and assess launch state for returning users
  useEffect(() => {
    if (phase === 'admin-check' && adminResult?.isAdmin === true) {
      setPhase('setup');
      const getWorkspacePromise =
        typeof window.electronAPI.getWorkspace === 'function'
          ? window.electronAPI.getWorkspace()
          : Promise.resolve(null);
      void Promise.all([
        window.electronAPI.assessLaunchState(),
        window.electronAPI.getProfile(),
        getWorkspacePromise,
      ])
        .then(([launchState, profile, savedWorkspace]) => {
          if (profile != null && profile.name !== '') {
            setUserName(profile.name);
          }
          if (launchState.envKeyDetected === true) {
            setEnvKeyDetected(true);
          }
          const resolvedWorkspace =
            savedWorkspace ??
            (typeof launchState.workspacePath === 'string' ? launchState.workspacePath : '');
          if (resolvedWorkspace !== '') {
            setWorkspacePath(resolvedWorkspace);
          }
          const firstStep = determineFirstIncompleteStep(launchState);
          goToStep(firstStep);
        })
        .catch(() => {
          // Default to needs-key if launch state assessment fails
        });
    }
  }, [phase, adminResult?.isAdmin, goToStep]);

  // Handle setup step completion
  useEffect(() => {
    if (phase === 'setup' && currentStep === 'ready') {
      setPhase('greeting');
    }
  }, [phase, currentStep]);

  // Fetch incomplete sessions when entering greeting phase (including default workspace when skipped)
  useEffect(() => {
    if (phase === 'greeting' && incompleteSessions.length === 0) {
      void window.electronAPI
        .getIncompleteSessions(workspacePath)
        .then((sessions) => {
          if (sessions.length > 0) {
            setIncompleteSessions(
              sessions.map((s) => ({
                id: s.id,
                workspacePath: s.workspacePath,
                updatedAt: s.updatedAt,
              })),
            );
          }
        })
        .catch(() => {
          // Failed to fetch — proceed without resume options
        });
    }
    // incompleteSessions intentionally excluded: it's checked in condition only to prevent re-fetching
    // if already populated. Including it would cause re-fetch every time setIncompleteSessions is called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, workspacePath]);

  // Admin check phase — block until admin privileges confirmed
  if (phase === 'admin-check') {
    if (adminResult === null) {
      // Waiting for admin check result from main process
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
          <p className="text-body text-text-muted-on-dark">Checking permissions...</p>
        </div>
      );
    }
    if (!adminResult.isAdmin) {
      return (
        <AdminBlockScreen
          platform={adminResult.platform}
          instructions={adminResult.instructions ?? ''}
          onRetry={() => {
            void window.electronAPI
              .retryAdminCheck()
              .then((result: AdminCheckResult) => {
                setAdminResult(result);
              })
              .catch(() => {
                // Admin check retry failed — keep current state
              });
          }}
          onQuit={() => {
            window.electronAPI.quitApp();
          }}
        />
      );
    }
    // Admin check passed — proceed to setup
    return null;
  }

  // Setup phase — walk through setup steps
  if (phase === 'setup') {
    if (currentStep === 'needs-key') {
      const finishKeyStep = (): void => {
        if (recoveringKey || sessionId !== null) {
          setRecoveringKey(false);
          setPhase('conversation');
          return;
        }
        completeCurrentStep();
      };
      return (
        <ApiKeySetup
          initialState={recoveringKey ? 'expired' : 'empty'}
          detectedEnvKey={envKeyDetected}
          onValidated={(key: string) =>
            // Propagate storage failures (e.g. OS encryption unavailable) back to ApiKeySetup
            // so it can show an actionable error instead of waiting indefinitely.
            Promise.all([
              window.electronAPI.storeApiKey(key),
              window.electronAPI.setAuthMode('api-key'),
            ]).then(() => {
              finishKeyStep();
            })
          }
          onSubscriptionSelected={() => {
            void window.electronAPI
              .setAuthMode('claude-subscription')
              .then(() => {
                finishKeyStep();
              })
              .catch(() => {
                // Auth mode IPC failure — proceed; mode is best-effort
                finishKeyStep();
              });
          }}
        />
      );
    }

    if (currentStep === 'needs-profile') {
      return (
        <ProfileSetup
          onComplete={(name: string) => {
            setUserName(name);
            void window.electronAPI
              .setProfile(name)
              .then(() => {
                completeCurrentStep();
              })
              .catch(() => {
                // Profile IPC failure — proceed; name is set in local state
              });
          }}
        />
      );
    }

    if (currentStep === 'needs-workspace') {
      return (
        <WorkspaceSelection
          onSelectFolder={(path: string) => {
            setWorkspacePath(path);
            void window.electronAPI
              .setWorkspace(path)
              .then(() => {
                completeCurrentStep();
              })
              .catch(() => {
                completeCurrentStep();
              });
          }}
          onSkip={() => {
            void window.electronAPI
              .setWorkspace('')
              .then((resolved: unknown) => {
                if (typeof resolved === 'string' && resolved !== '') {
                  setWorkspacePath(resolved);
                }
                completeCurrentStep();
              })
              .catch(() => {
                completeCurrentStep();
              });
          }}
        />
      );
    }

    if (currentStep === 'needs-avatar') {
      return (
        <AvatarSelection
          onSelect={(personaId: string) => {
            void window.electronAPI
              .selectAvatar(personaId)
              .then(() => {
                completeCurrentStep();
              })
              .catch(() => {
                completeCurrentStep();
              });
          }}
        />
      );
    }

    // ready step — return loading state while useEffect transitions phase
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
        <p className="text-body text-text-muted-on-dark">Loading...</p>
      </div>
    );
  }

  // Greeting phase — show greeting with incomplete sessions or session start error
  if (phase === 'greeting') {
    if (sessionError !== null) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-stage-bg">
          <p className="text-body text-semantic-error" role="alert">
            Failed to start session: {sessionError}
          </p>
          <button
            type="button"
            onClick={() => {
              void startNewSession();
            }}
            className="rounded-lg bg-primary px-6 py-3 text-body font-semibold text-white"
          >
            Retry session
          </button>
        </div>
      );
    }

    return (
      <SessionGreeting
        userName={userName || 'there'}
        incompleteSessions={incompleteSessions}
        onResume={(sessionIdToResume: string) => {
          void window.electronAPI
            .resumeSession(sessionIdToResume)
            .then(() => {
              setSessionId(sessionIdToResume);
              setPhase('conversation');
            })
            .catch(() => {
              // Resume failed — fall through to start new session
            });
        }}
        onStartNew={() => {
          void startNewSession();
        }}
      />
    );
  }

  // Conversation phase — main interaction
  return (
    <ConversationView
      userName={userName || 'there'}
      avatarName="Mary"
      sessionId={sessionId ?? ''}
      onSetupKey={() => {
        setRecoveringKey(true);
        goToStep('needs-key');
        setPhase('setup');
      }}
    />
  );
}
