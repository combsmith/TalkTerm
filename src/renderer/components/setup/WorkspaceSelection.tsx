import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from 'react';

interface WorkspaceSelectionProps {
  onSelectFolder: (path: string) => void;
  onSkip: () => void;
}

export function WorkspaceSelection({
  onSelectFolder,
  onSkip,
}: WorkspaceSelectionProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Auto-focus path input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // After showing confirmation briefly, advance
  useEffect(() => {
    if (!confirmed) {
      return;
    }
    const timer = setTimeout(() => {
      onSelectFolder(path);
    }, 1200);
    return (): void => {
      clearTimeout(timer);
    };
  }, [confirmed, path, onSelectFolder]);

  function handleSubmit(e: SyntheticEvent): void {
    e.preventDefault();
    if (path.trim() !== '') {
      setConfirmed(true);
    }
  }

  async function handleBrowse(): Promise<void> {
    const browseWorkspace = (
      window as { electronAPI?: { browseWorkspace?: typeof window.electronAPI.browseWorkspace } }
    ).electronAPI?.browseWorkspace;
    if (typeof browseWorkspace === 'function') {
      const selected = await browseWorkspace();
      if (selected !== null && selected.trim() !== '') {
        setPath(selected);
        setConfirmed(true);
      }
    }
  }

  if (confirmed) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10">
          <h1 className="text-center text-display text-text-on-dark">Connect a project</h1>
          <div className="flex flex-col items-center gap-2">
            <p className="text-body font-semibold text-semantic-success">✓ Workspace selected</p>
            <p className="text-body text-primary" data-testid="selected-folder">
              {path}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10">
        <h1 className="text-center text-display text-text-on-dark">Connect a project</h1>
        <p className="text-center text-body text-text-muted-on-dark">
          Enter the path to a local project folder so TalkTerm can work within your codebase. Or
          skip to get started with BMAD defaults.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
              }}
              placeholder="/path/to/your/project"
              className="flex-1 rounded-lg border border-text-muted-on-dark bg-stage-bg px-4 py-3 text-body text-text-on-dark outline-none transition-colors focus:border-primary"
              data-testid="folder-input"
            />
            <button
              type="button"
              onClick={() => {
                void handleBrowse();
              }}
              className="rounded-lg border border-text-muted-on-dark px-4 py-3 text-body text-text-on-dark transition-colors hover:border-primary"
            >
              Browse...
            </button>
          </div>
          <button
            type="submit"
            disabled={path.trim() === ''}
            className="w-full rounded-lg bg-primary py-3 text-body font-semibold text-white transition-colors hover:bg-primary-dark focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select Folder
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-lg border border-text-muted-on-dark py-3 text-body text-text-muted-on-dark transition-colors hover:border-text-on-dark hover:text-text-on-dark"
          >
            Skip — use BMAD defaults
          </button>
        </form>
      </div>
    </div>
  );
}
