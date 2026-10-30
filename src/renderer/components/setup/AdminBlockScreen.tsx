import type { ReactElement } from 'react';

interface AdminBlockScreenProps {
  platform: string;
  instructions: string;
  onRetry: () => void;
  onQuit: () => void;
}

export function AdminBlockScreen({
  instructions,
  onRetry,
  onQuit,
}: AdminBlockScreenProps): ReactElement {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10 text-center">
        <div data-testid="warning-icon" className="text-5xl">
          ⚠️
        </div>
        <h1 className="text-display text-text-on-dark">TalkTerm needs admin privileges</h1>
        {instructions !== '' && (
          <pre className="rounded-lg bg-stage-bg px-4 py-3 text-left text-small text-text-on-dark">
            {instructions}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-lg bg-primary py-3 text-body font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="flex-1 rounded-lg bg-surface-muted py-3 text-body font-semibold text-text-on-dark transition-colors hover:bg-surface-muted/80"
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
