import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type SyntheticEvent,
} from 'react';

type AuthChoice = 'none' | 'api-key' | 'claude-subscription';

interface ApiKeySetupProps {
  /** May return a promise; a rejection (e.g. secure storage unavailable) restores a retry state. */
  onValidated: (key: string) => void | Promise<void>;
  onSubscriptionSelected: () => void;
  initialState?: 'empty' | 'expired';
  detectedEnvKey?: boolean;
}

const STORAGE_FAILURE_MESSAGE =
  "Your key couldn't be saved securely on this device. Please try again, or use the Claude Pro/Max option.";

function storageFailureMessage(err: unknown): string {
  const detail = err instanceof Error && err.message !== '' ? ` (${err.message})` : '';
  return `${STORAGE_FAILURE_MESSAGE}${detail}`;
}

export function ApiKeySetup({
  onValidated,
  onSubscriptionSelected,
  initialState,
  detectedEnvKey,
}: ApiKeySetupProps): ReactElement {
  const [authChoice, setAuthChoice] = useState<AuthChoice>('none');
  const [envKeyDeclined, setEnvKeyDeclined] = useState(false);
  const [envKeyError, setEnvKeyError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(
    initialState === 'expired'
      ? 'Your API key has expired or been revoked. Please enter a new one.'
      : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const validationSeqRef = useRef(0);
  const latestKeyRef = useRef(key);

  // Auto-focus input when API key entry is shown
  useEffect(() => {
    if (authChoice === 'api-key') {
      inputRef.current?.focus();
    }
  }, [authChoice]);

  // Auto-advance after validation succeeds
  useEffect(() => {
    if (!isValid) return;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => onValidated(key))
        .catch((err: unknown) => {
          setIsValid(false);
          setError(storageFailureMessage(err));
        });
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [isValid, key, onValidated]);

  function handleUseEnvKey(): void {
    setEnvKeyError(null);
    Promise.resolve()
      .then(() => onValidated('ENV_KEY'))
      .catch((err: unknown) => {
        setEnvKeyError(storageFailureMessage(err));
      });
  }

  async function handleValidate(): Promise<void> {
    const submittedKey = key;
    if (submittedKey.trim() === '') return;
    const seq = ++validationSeqRef.current;
    latestKeyRef.current = submittedKey;
    setIsValidating(true);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (validationSeqRef.current !== seq || latestKeyRef.current !== submittedKey) {
      return;
    }

    if (submittedKey.startsWith('sk-ant-oat')) {
      setIsValid(false);
      setError(
        'This looks like a Claude subscription token — use the "Claude Pro/Max" option instead, or enter an API key that starts with sk-ant-api03-.',
      );
      setIsValidating(false);
      return;
    }

    if (submittedKey.startsWith('sk-ant-api')) {
      const validateApiKey = (
        window as { electronAPI?: { validateApiKey?: typeof window.electronAPI.validateApiKey } }
      ).electronAPI?.validateApiKey;
      if (typeof validateApiKey === 'function') {
        const result = await validateApiKey(submittedKey);
        if (validationSeqRef.current !== seq || latestKeyRef.current !== submittedKey) {
          return;
        }
        setIsValid(result.valid);
        setError(result.valid ? null : (result.message ?? 'Invalid API key.'));
      } else {
        setIsValid(true);
        setError(null);
      }
    } else {
      setIsValid(false);
      setError("That key didn't work — API keys start with sk-ant-api03-");
    }
    setIsValidating(false);
  }

  function handleSubmit(e: SyntheticEvent): void {
    e.preventDefault();
    if (hasInput && !isValidating && !isValid) {
      void handleValidate();
    }
  }

  const hasInput = key.trim() !== '';

  const autoFocusRef = useCallback((el: HTMLButtonElement | null) => el?.focus(), []);

  // If ANTHROPIC_API_KEY env var detected, offer to use it directly
  if (detectedEnvKey === true && !envKeyDeclined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUseEnvKey();
          }}
          className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10"
        >
          <h1 className="text-center text-display text-text-on-dark">Get Started</h1>

          <div className="rounded-lg border border-semantic-success/30 bg-semantic-success/10 p-4">
            <p className="text-center text-body text-text-on-dark">
              Found an existing API key in your environment
            </p>
            <p className="mt-1 text-center text-small text-text-muted-on-dark">
              ANTHROPIC_API_KEY is already configured on this system.
            </p>
          </div>

          {envKeyError !== null && (
            <p className="text-center text-small text-danger" role="alert">
              {envKeyError}
            </p>
          )}

          <button
            ref={autoFocusRef}
            type="submit"
            className="w-full rounded-lg bg-primary py-3 text-body font-semibold text-white transition-colors hover:bg-primary-dark focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            Use existing key
          </button>

          <button
            type="button"
            onClick={() => {
              setEnvKeyDeclined(true);
              setError(null);
            }}
            className="min-h-8 min-w-8 px-2 py-1 text-center text-small text-text-muted-on-dark hover:text-text-on-dark"
          >
            Enter a different key instead
          </button>
        </form>
      </div>
    );
  }

  // Auth method choice screen
  if (authChoice === 'none') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10">
          <h1 className="text-center text-display text-text-on-dark">Get Started</h1>

          <p className="text-center text-body text-text-muted-on-dark">
            How would you like to connect to Claude?
          </p>

          <button
            type="button"
            onClick={() => {
              onSubscriptionSelected();
            }}
            className="w-full rounded-lg border-2 border-primary bg-primary/10 px-4 py-4 text-left transition-colors hover:bg-primary/20 focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            <span className="block text-body font-semibold text-text-on-dark">
              Claude Pro / Max Subscription
            </span>
            <span className="mt-1 block text-small text-text-muted-on-dark">
              Sign in with your existing Claude account. No API key needed.
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthChoice('api-key');
            }}
            className="w-full rounded-lg border-2 border-text-muted-on-dark/30 px-4 py-4 text-left transition-colors hover:border-text-muted-on-dark/60 hover:bg-surface-muted/50 focus:ring-2 focus:ring-primary/50 focus:outline-none"
          >
            <span className="block text-body font-semibold text-text-on-dark">
              Anthropic API Key
            </span>
            <span className="mt-1 block text-small text-text-muted-on-dark">
              Use an API key from console.anthropic.com. Pay-as-you-go billing.
            </span>
          </button>
        </div>
      </div>
    );
  }

  // API key entry screen
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-surface-muted/80 p-10"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              validationSeqRef.current++;
              latestKeyRef.current = '';
              setAuthChoice('none');
              setKey('');
              setError(null);
              setIsValid(false);
              setIsValidating(false);
            }}
            className="min-h-8 min-w-8 px-2 py-1 text-small text-text-muted-on-dark hover:text-text-on-dark"
          >
            Back
          </button>
          <h1 className="flex-1 text-center text-display text-text-on-dark">Enter API Key</h1>
          <div className="w-8" />
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="password"
            value={key}
            onChange={(e) => {
              validationSeqRef.current++;
              latestKeyRef.current = e.target.value;
              setKey(e.target.value);
              setIsValid(false);
              setIsValidating(false);
              setError(null);
            }}
            placeholder="sk-ant-api03-..."
            className={`w-full rounded-lg border px-4 py-3 text-body text-text-on-dark bg-stage-bg outline-none transition-colors ${
              isValid
                ? 'border-semantic-success'
                : error !== null && error !== ''
                  ? 'border-danger'
                  : 'border-text-muted-on-dark focus:border-primary'
            }`}
          />
          {isValid && <p className="text-small text-semantic-success">Key verified</p>}
          {error !== null && error !== '' && <p className="text-small text-danger">{error}</p>}
        </div>

        <div className="flex flex-col gap-2 text-center">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-small text-primary hover:underline"
          >
            Create a free API key at console.anthropic.com
          </a>
        </div>

        {isValid ? (
          <p className="w-full rounded-lg bg-semantic-success/20 py-3 text-center text-body font-semibold text-semantic-success">
            Continuing...
          </p>
        ) : (
          <button
            type="submit"
            disabled={!hasInput || isValidating}
            className="w-full rounded-lg bg-primary py-3 text-body font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Validating...' : 'Validate API Key'}
          </button>
        )}
      </form>
    </div>
  );
}
