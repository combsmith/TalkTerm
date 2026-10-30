import { describe, it, expect } from 'vitest';
import {
  classifyError,
  createUserFriendlyMessage,
  recoveryOptionsForCategory,
} from './agent-error';

describe('classifyError', () => {
  it('classifies network errors', () => {
    expect(classifyError(new Error('network timeout'))).toBe('network-error');
    expect(classifyError(new Error('fetch failed'))).toBe('network-error');
  });

  it('classifies auth errors', () => {
    expect(classifyError(new Error('401 Unauthorized'))).toBe('auth-error');
    expect(classifyError(new Error('invalid api key'))).toBe('auth-error');
  });

  it('classifies billing errors', () => {
    expect(classifyError(new Error('credit balance is too low'))).toBe('billing-error');
  });

  it('classifies rate limit errors', () => {
    expect(classifyError(new Error('429 rate limit exceeded'))).toBe('rate-limit');
  });

  it('classifies file permission errors', () => {
    expect(classifyError(new Error('EACCES permission denied'))).toBe('file-permission');
  });

  it('classifies STT errors', () => {
    expect(classifyError(new Error('speech recognition failed'))).toBe('stt-error');
  });

  it('classifies TTS errors', () => {
    expect(classifyError(new Error('tts synthesis failed'))).toBe('tts-error');
  });

  it('returns unknown for unrecognized errors', () => {
    expect(classifyError(new Error('something else'))).toBe('unknown');
    expect(classifyError('string error')).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});

describe('recoveryOptionsForCategory', () => {
  it('returns category-specific recovery options', () => {
    expect(recoveryOptionsForCategory('auth-error')).toHaveLength(2);
    expect(recoveryOptionsForCategory('billing-error')).toHaveLength(1);
    expect(recoveryOptionsForCategory('rate-limit')).toHaveLength(1);
    expect(recoveryOptionsForCategory('network-error')).toHaveLength(1);
    expect(recoveryOptionsForCategory('unknown')).toHaveLength(1);
  });
});

describe('createUserFriendlyMessage', () => {
  it('returns friendly messages for each category', () => {
    expect(createUserFriendlyMessage('network-error')).toContain('trouble reaching');
    expect(createUserFriendlyMessage('auth-error')).toContain('API key');
    expect(createUserFriendlyMessage('billing-error')).toContain('credits');
    expect(createUserFriendlyMessage('rate-limit')).toContain('busy');
    expect(createUserFriendlyMessage('unknown')).toContain('went wrong');
  });

  it('never contains technical details', () => {
    const categories = [
      'network-error',
      'auth-error',
      'rate-limit',
      'file-permission',
      'sdk-error',
      'stt-error',
      'tts-error',
      'unknown',
    ] as const;
    for (const cat of categories) {
      const msg = createUserFriendlyMessage(cat);
      expect(msg).not.toMatch(/\d{3}/); // no HTTP codes
      expect(msg).not.toContain('Error:');
      expect(msg).not.toContain('stack');
    }
  });
});
