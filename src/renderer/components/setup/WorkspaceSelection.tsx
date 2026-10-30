import { useEffect, useRef, useState, type ReactElement, type SyntheticEvent } from 'react';

interface WorkspaceSelectionProps {
  onSelectFolder: (path: string) => void | Promise<void>;
  onSkip: () => void;
}

function formatWorkspaceError(err: unknown): string {
  if (err instanceof Error && err.message !== '') {
    return err.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  }
  return 'Workspace directory does not exist or is not accessible';
}

export function WorkspaceSelection({
  onSelectFolder,
  onSkip,
}: WorkspaceSelectionProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      try {
        const result = onSelectFolder(path);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            setConfirmed(false);
            setError(formatWorkspaceError(err));
          });
        }
      } catch (err: unknown) {
        setConfirmed(false);
        setError(formatWorkspaceError(err));
      }
    }, 1200);
    return (): void => {
      clearTimeout(timer);
    };
  }, [confirmed, path, onSelectFolder]);

  function confirmFolder(selectedPath: string): void {
    const trimmed = selectedPath.trim();
    if (trimmed === '') {
      return;
    }
    setError(null);
    const setWorkspace = (
      window as { electronAPI?: { setWorkspace?: typeof window.electronAPI.setWorkspace } }
    ).electronAPI?.setWorkspace;
    if (typeof setWorkspace === 'function') {
      void Promise.resolve()
        .then(() => setWorkspace(trimmed))
        .then((resolved: unknown) => {
          setPath(
            typeof resolved === 'string' && resolved.trim() !== '' ? resolved.trim() : trimmed,
          );
          setConfirmed(true);
        })
        .catch((err: unknown) => {
          setConfirmed(false);
          setError(formatWorkspaceError(err));
        });
      return;
    }
    setPath(trimmed);
    setConfirmed(true);
  }

  function handleSubmit(e: SyntheticEvent): void {
    e.preventDefault();
    confirmFolder(path);
  }

  async function handleBrowse(): Promise<void> {
    const browseWorkspace = (
      window as { electronAPI?: { browseWorkspace?: typeof window.electronAPI.browseWorkspace } }
    ).electronAPI?.browseWorkspace;
    if (typeof browseWorkspace === 'function') {
      const selected = await browseWorkspace();
      if (selected !== null && selected.trim() !== '') {
        confirmFolder(selected);
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
                if (error !== null) {
                  setError(null);
                }
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
          {error !== null && (
            <p className="text-small text-semantic-error" role="alert">
              {error}
            </p>
          )}
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
