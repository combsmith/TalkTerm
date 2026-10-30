import type { ReactElement } from 'react';

interface DocumentViewProps {
  markdown: string;
  filePath?: string;
  onDismiss?: () => void;
}

export function DocumentView({ markdown, filePath, onDismiss }: DocumentViewProps): ReactElement {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {onDismiss !== undefined && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="text-caption text-text-muted-on-dark hover:text-text-on-dark"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="prose prose-invert max-w-none text-text-on-dark">
        <pre className="whitespace-pre-wrap text-body">{markdown}</pre>
      </div>
      {filePath !== undefined && (
        <div className="mt-4 border-t border-surface-muted pt-3">
          <span className="text-caption text-text-muted-on-dark">Saved to: {filePath}</span>
        </div>
      )}
    </div>
  );
}
