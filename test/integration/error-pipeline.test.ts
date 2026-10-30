import { describe, it, expect } from 'vitest';
import {
  classifyError,
  createUserFriendlyMessage,
  type ErrorCategory,
} from '../../src/shared/types/domain/agent-error';

/**
 * Error Pipeline Integration Tests
 * Covers FR34 (friendly error messages), FR35 (recovery options)
 *
 * Tests the full error pipeline: raw error -> classifyError -> createUserFriendlyMessage.
 * Verifies that the end-to-end pipeline never leaks technical details to users
 * and always produces recovery-oriented messaging.
 */
describe('Error Pipeline Integration', () => {
  describe('raw SDK errors -> classifyError -> friendly message (no technical leaks)', () => {
    const technicalErrors: Array<{ raw: Error; expectedCategory: ErrorCategory }> = [
      {
        raw: new Error('network request failed: ECONNREFUSED 127.0.0.1:8080'),
        expectedCategory: 'network-error',
      },
      { raw: new Error('fetch error: socket hang up'), expectedCategory: 'network-error' },
      {
        raw: new Error('HTTP 401 Unauthorized: invalid x-api-key'),
        expectedCategory: 'auth-error',
      },
      { raw: new Error('Invalid API key provided'), expectedCategory: 'auth-error' },
      {
        raw: new Error('HTTP 429 Too Many Requests: rate limit exceeded'),
        expectedCategory: 'rate-limit',
      },
      {
        raw: new Error('EACCES: permission denied, open /etc/shadow'),
        expectedCategory: 'file-permission',
      },
      { raw: new Error('speech recognition not available'), expectedCategory: 'stt-error' },
      { raw: new Error('TTS synthesis failed: voice unavailable'), expectedCategory: 'tts-error' },
      { raw: new Error('agent SDK internal error'), expectedCategory: 'sdk-error' },
      { raw: new Error('something completely unexpected happened'), expectedCategory: 'unknown' },
    ];

    for (const { raw, expectedCategory } of technicalErrors) {
      it(`classifies "${raw.message}" as ${expectedCategory}`, () => {
        const category = classifyError(raw);
        expect(category).toBe(expectedCategory);

        const friendlyMessage = createUserFriendlyMessage(category);

        // The friendly message must never contain technical details
        expect(friendlyMessage).not.toContain(raw.message);
        expect(friendlyMessage).not.toMatch(/\d{3}/); // no HTTP status codes
        expect(friendlyMessage).not.toContain('Error:');
        expect(friendlyMessage).not.toContain('ECONNREFUSED');
        expect(friendlyMessage).not.toContain('EACCES');
        expect(friendlyMessage).not.toContain('stack');
        expect(friendlyMessage).not.toContain('127.0.0.1');
        expect(friendlyMessage).not.toContain('/etc/shadow');

        // The friendly message must be non-empty and user-facing
        expect(friendlyMessage.length).toBeGreaterThan(10);
      });
    }
  });

  describe('each error category produces recovery-oriented messaging', () => {
    const allCategories: ErrorCategory[] = [
      'network-error',
      'auth-error',
      'rate-limit',
      'file-permission',
      'sdk-error',
      'stt-error',
      'tts-error',
      'unknown',
    ];

    for (const category of allCategories) {
      it(`${category} produces a non-empty friendly message`, () => {
        const message = createUserFriendlyMessage(category);
        expect(message).toBeTruthy();
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    }
  });

  describe('network errors specifically produce reconnect-type messaging', () => {
    it('network error message suggests connectivity issue', () => {
      const category = classifyError(new Error('network timeout'));
      expect(category).toBe('network-error');

      const message = createUserFriendlyMessage(category);
      // Should suggest a service connectivity issue and retry
      expect(message).toMatch(/trouble reaching|try again|connect/i);
    });

    it('ECONNREFUSED produces network error category', () => {
      const category = classifyError(new Error('ECONNREFUSED'));
      expect(category).toBe('network-error');
    });

    it('fetch failures produce network error category', () => {
      const category = classifyError(new Error('fetch failed'));
      expect(category).toBe('network-error');
    });
  });

  describe('non-Error inputs are classified as unknown', () => {
    it('classifies string as unknown', () => {
      expect(classifyError('just a string')).toBe('unknown');
    });

    it('classifies null as unknown', () => {
      expect(classifyError(null)).toBe('unknown');
    });

    it('classifies undefined as unknown', () => {
      expect(classifyError(undefined)).toBe('unknown');
    });

    it('classifies number as unknown', () => {
      expect(classifyError(42)).toBe('unknown');
    });

    it('classifies plain object as unknown', () => {
      expect(classifyError({ code: 500 })).toBe('unknown');
    });
  });

  describe('end-to-end pipeline: error -> classify -> message never exposes internals', () => {
    it('a realistic SDK error goes through the full pipeline safely', () => {
      const sdkError = new Error(
        'AnthropicError: 401 {"error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      );

      const category = classifyError(sdkError);
      const message = createUserFriendlyMessage(category);

      // Must be classified (not leak to UI as-is)
      expect(category).toBe('auth-error');

      // Message must be user-friendly
      expect(message).toContain('API key');
      expect(message).not.toContain('AnthropicError');
      expect(message).not.toContain('authentication_error');
      expect(message).not.toContain('x-api-key');
    });

    it('a realistic network error goes through the full pipeline safely', () => {
      const networkError = new Error(
        'TypeError: fetch failed\n    at node:internal/deps/undici/undici:13500:13',
      );

      const category = classifyError(networkError);
      const message = createUserFriendlyMessage(category);

      expect(category).toBe('network-error');
      expect(message).not.toContain('TypeError');
      expect(message).not.toContain('undici');
      expect(message).not.toContain('node:internal');
    });
  });
});
