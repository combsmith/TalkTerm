export type ApiKeyState =
  | { status: 'none' }
  | { status: 'valid' }
  | { status: 'expired'; message: string }
  | { status: 'validating' }
  | { status: 'invalid'; message: string };

export type ApiKeyValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason: 'invalid-format' | 'invalid-key' | 'expired' | 'network-error';
      message: string;
    };
