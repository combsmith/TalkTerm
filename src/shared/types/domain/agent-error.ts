export type ErrorCategory =
  | 'network-error'
  | 'auth-error'
  | 'billing-error'
  | 'rate-limit'
  | 'file-permission'
  | 'sdk-error'
  | 'stt-error'
  | 'tts-error'
  | 'unknown';

export interface AgentError {
  category: ErrorCategory;
  userMessage: string;
  recoveryOptions: RecoveryOption[];
  isRecoverable: boolean;
}

export interface RecoveryOption {
  label: string;
  action: string;
  description: string;
}

const ERROR_CATEGORY_KEYWORDS: ReadonlyArray<readonly [ErrorCategory, readonly string[]]> = [
  ['network-error', ['network', 'fetch', 'econnrefused', 'enotfound', 'socket hang up', 'timeout']],
  ['auth-error', ['401', 'unauthorized', 'api key', 'invalid_api_key', 'authentication']],
  ['billing-error', ['credit', 'balance', 'billing', 'insufficient', 'payment']],
  ['rate-limit', ['429', 'rate limit', 'rate_limit', 'overloaded', 'capacity']],
  ['file-permission', ['permission', 'eacces']],
  ['tts-error', ['synthesis', 'voice', 'speak']],
  ['stt-error', ['recognition', 'speech', 'microphone', 'listen']],
  ['sdk-error', ['sdk', 'agent']],
];

export function classifyError(error: unknown): ErrorCategory {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const msg = raw.toLowerCase();
  if (msg === '') return 'unknown';

  for (const [category, keywords] of ERROR_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => msg.includes(kw))) {
      return category;
    }
  }

  return 'unknown';
}

export function recoveryOptionsForCategory(category: ErrorCategory): RecoveryOption[] {
  switch (category) {
    case 'auth-error':
      return [
        { label: 'Re-enter API key', action: 'setup-key', description: 'Update your API key' },
        { label: 'Try again', action: 'retry', description: 'Retry with current key' },
      ];
    case 'billing-error':
      return [{ label: 'Try again', action: 'retry', description: 'Retry after adding credits' }];
    case 'rate-limit':
      return [{ label: 'Try again', action: 'retry', description: 'Retry after a moment' }];
    case 'network-error':
      return [
        { label: 'Try again', action: 'retry', description: 'Retry when connection is restored' },
      ];
    default:
      return [{ label: 'Try again', action: 'retry', description: 'Retry the last action' }];
  }
}

export function createUserFriendlyMessage(category: ErrorCategory): string {
  switch (category) {
    case 'network-error':
      return "I'm having trouble reaching the service. Let me try again in a moment.";
    case 'auth-error':
      return "There's an issue with your API key. Let's get that sorted out.";
    case 'billing-error':
      return 'Your API account needs credits. Please add credits at console.anthropic.com to continue.';
    case 'rate-limit':
      return "The service is busy right now. I'll retry in a few seconds.";
    case 'file-permission':
      return "I don't have permission to access that file. Let's find another way.";
    case 'sdk-error':
      return 'Something unexpected happened. Let me try a different approach.';
    case 'stt-error':
      return 'I had trouble hearing you. Could you try again?';
    case 'tts-error':
      return 'I had trouble speaking. Let me try to show you instead.';
    case 'unknown':
      return 'Something went wrong, but we can work through it.';
    /* c8 ignore next 3 */
    default:
      const _exhaustive: never = category;
      return _exhaustive;
  }
}
