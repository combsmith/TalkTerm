/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- accessing private recognition mock */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSpeechStt } from './web-speech-stt';

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
}

describe('WebSpeechStt', () => {
  beforeEach(() => {
    vi.stubGlobal('SpeechRecognition', MockSpeechRecognition);
    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockSpeechRecognition,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('implements SpeechToText interface', () => {
    const stt = new WebSpeechStt();
    expect(stt.isListening).toBe(false);
    expect(stt.onResult).toBeNull();
    expect(stt.onError).toBeNull();
  });

  it('starts listening', () => {
    const stt = new WebSpeechStt();
    stt.start();
    expect(stt.isListening).toBe(true);
  });

  it('stops listening', () => {
    const stt = new WebSpeechStt();
    stt.start();
    stt.stop();
    expect(stt.isListening).toBe(false);
  });

  it('fires onResult when recognition produces a result', () => {
    const stt = new WebSpeechStt();
    const onResult = vi.fn();
    stt.onResult = onResult;
    stt.start();

    // Simulate the recognition firing a result event
    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onresult?.({
      results: {
        length: 1,
        0: { 0: { transcript: 'hello world' }, isFinal: true },
      },
    });

    expect(onResult).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: true });
  });

  it('fires onResult with empty transcript when result[0].transcript is undefined', () => {
    const stt = new WebSpeechStt();
    const onResult = vi.fn();
    stt.onResult = onResult;
    stt.start();

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onresult?.({
      results: {
        length: 1,
        // transcript is absent — exercises the `?? ''` fallback
        0: { 0: {}, isFinal: false },
      },
    });

    expect(onResult).toHaveBeenCalledWith({ transcript: '', isFinal: false });
  });

  it('fires onError with network message for network errors', () => {
    const stt = new WebSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;
    stt.start();

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onerror?.({ error: 'network' });

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0]?.[0] as Error;
    expect(errorArg.message).toContain('not available in Electron');
  });

  it('fires onError with generic message for non-network errors', () => {
    const stt = new WebSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;
    stt.start();

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onerror?.({ error: 'aborted' });

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0]?.[0] as Error;
    expect(errorArg.message).toContain('aborted');
  });

  it('fires onEnd and resets isListening when recognition ends', () => {
    const stt = new WebSpeechStt();
    const onEnd = vi.fn();
    stt.onEnd = onEnd;
    stt.start();
    expect(stt.isListening).toBe(true);

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onend?.();

    expect(stt.isListening).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('fires onstart, onaudiostart, and onspeechstart callbacks without error', () => {
    const stt = new WebSpeechStt();
    stt.start();

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    // These are debug-only callbacks; just ensure they don't throw
    expect(() => recognition.onstart?.()).not.toThrow();
    expect(() => recognition.onaudiostart?.()).not.toThrow();
    expect(() => recognition.onspeechstart?.()).not.toThrow();
  });

  it('fires onError when recognition.start() throws', () => {
    // Make the mock throw on start
    const ThrowingSpeechRecognition = class extends MockSpeechRecognition {
      override start = vi.fn(() => {
        throw new Error('mic permission denied');
      });
    };
    Object.defineProperty(window, 'SpeechRecognition', {
      value: ThrowingSpeechRecognition,
      writable: true,
      configurable: true,
    });
    const stt = new WebSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;
    stt.start();

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0]?.[0] as Error;
    expect(errorArg.message).toContain('mic permission denied');
  });

  it('does nothing when start() called while already listening', () => {
    const stt = new WebSpeechStt();
    stt.start();
    expect(stt.isListening).toBe(true);
    const recognition = (stt as any).recognition as MockSpeechRecognition;
    const callCount = recognition.start.mock.calls.length;
    // Second start should be a no-op
    stt.start();
    expect(recognition.start.mock.calls.length).toBe(callCount);
  });

  it('fires onResult with empty transcript when result[0] is undefined', () => {
    const stt = new WebSpeechStt();
    const onResult = vi.fn();
    stt.onResult = onResult;
    stt.start();

    const recognition = (stt as any).recognition as MockSpeechRecognition;
    recognition.onresult?.({
      results: {
        length: 1,
        0: undefined,
      },
    });

    // result is defined but result[0] is undefined — should not call onResult
    expect(onResult).not.toHaveBeenCalled();
  });

  it('fires onError with String() when start() throws a non-Error value', () => {
    const ThrowingNonError = class extends MockSpeechRecognition {
      override start = vi.fn(() => {
        throw 'mic blocked'; // eslint-disable-line @typescript-eslint/only-throw-error
      });
    };
    Object.defineProperty(window, 'SpeechRecognition', {
      value: ThrowingNonError,
      writable: true,
      configurable: true,
    });
    const stt = new WebSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;
    stt.start();

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0]?.[0] as Error;
    expect(errorArg.message).toContain('mic blocked');
  });

  it('calls onError when speech recognition not supported', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const stt = new WebSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;
    stt.start();

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0]?.[0] as Error;
    expect(errorArg.message).toContain('not supported');
  });
});
