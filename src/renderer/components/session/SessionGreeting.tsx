import { useEffect, type ReactElement } from 'react';
import { AvatarCanvas } from '../avatar/AvatarCanvas';

interface SessionGreetingProps {
  userName: string;
  incompleteSessions: Array<{ id: string; workspacePath: string; updatedAt: string }>;
  onResume: (sessionId: string) => void;
  onStartNew: () => void;
}

export function SessionGreeting({
  userName,
  incompleteSessions,
  onResume,
  onStartNew,
}: SessionGreetingProps): ReactElement {
  // Auto-advance to conversation after brief greeting when no incomplete sessions
  useEffect(() => {
    if (incompleteSessions.length === 0) {
      const timer = setTimeout(() => {
        onStartNew();
      }, 2000);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [incompleteSessions.length, onStartNew]);

  if (incompleteSessions.length === 0) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-stage-bg gap-4">
        <AvatarCanvas state="ready" />
        <h1 className="text-display text-text-on-dark">Hey {userName}!</h1>
        <p className="text-body text-text-muted-on-dark">What are you working on today?</p>
        <p className="text-caption text-text-muted-on-dark animate-pulse">
          Loading conversation...
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-stage-bg gap-6">
      <AvatarCanvas state="ready" />
      <h1 className="text-display text-text-on-dark">Welcome back, {userName}!</h1>
      <p className="text-body text-text-muted-on-dark">
        {incompleteSessions.length === 1
          ? 'You left a session mid-way. Want to pick up where you left off?'
          : `You have ${String(incompleteSessions.length)} sessions in progress.`}
      </p>
      <div className="flex w-full max-w-md flex-col gap-3">
        {incompleteSessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              onResume(session.id);
            }}
            className="rounded-xl border-2 border-text-muted-on-dark p-4 text-left transition-all hover:border-primary hover:-translate-y-0.5"
          >
            <span className="text-body text-text-on-dark">{session.workspacePath}</span>
            <span className="block text-caption text-text-muted-on-dark">{session.updatedAt}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onStartNew}
          className="rounded-lg border border-text-muted-on-dark py-3 text-body text-text-muted-on-dark transition-colors hover:border-text-on-dark hover:text-text-on-dark"
        >
          Start new session
        </button>
      </div>
    </div>
  );
}
