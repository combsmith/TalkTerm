/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks are not class methods */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSpeechTts } from './web-speech-tts';

describe('WebSpeechTts', () => {
  beforeEach(() => {
    const mockSpeechSynthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
    };
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation(function (text: string) {
        return {
          text,
          voice: null,
          onend: null,
          onerror: null,
        };
      }),
    );
  });

  it('implements TextToSpeech interface', () => {
    const tts = new WebSpeechTts();
    expect(tts.isSpeaking).toBe(false);
    expect(tts.onEnd).toBeNull();
  });

  it('speaks text', () => {
    const tts = new WebSpeechTts();
    tts.speak('Hello');
    expect(tts.isSpeaking).toBe(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('stops speaking', () => {
    const tts = new WebSpeechTts();
    tts.speak('Hello');
    tts.stop();
    expect(tts.isSpeaking).toBe(false);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it('sets voice when voiceName matches an available voice', () => {
    const mockVoice = { name: 'Samantha', lang: 'en-US' };
    (window.speechSynthesis.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([mockVoice]);

    const tts = new WebSpeechTts();
    tts.speak('Hello', 'Samantha');

    expect(tts.isSpeaking).toBe(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it('does nothing when speechSynthesis is not available', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const tts = new WebSpeechTts();
    expect(() => {
      tts.speak('Hello');
    }).not.toThrow();
    expect(tts.isSpeaking).toBe(false);
  });

  it('fires onEnd callback when utterance ends', () => {
    const tts = new WebSpeechTts();
    const onEnd = vi.fn();
    tts.onEnd = onEnd;

    // Capture the utterance to trigger its onend
    const captured: {
      utterance: { text: string; voice: unknown; onend: (() => void) | null } | null;
    } = { utterance: null };
    (window.speechSynthesis.speak as ReturnType<typeof vi.fn>).mockImplementation(
      (u: { text: string; voice: unknown; onend: (() => void) | null }) => {
        captured.utterance = u;
      },
    );

    tts.speak('Hello');
    expect(tts.isSpeaking).toBe(true);

    // Simulate utterance ending
    captured.utterance?.onend?.();

    expect(tts.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('finalizes playback and fires onEnd when speech synthesis fails with onerror', () => {
    const tts = new WebSpeechTts();
    const onEnd = vi.fn();
    tts.onEnd = onEnd;

    const captured: {
      utterance: {
        text: string;
        voice: unknown;
        onend: (() => void) | null;
        onerror: (() => void) | null;
      } | null;
    } = { utterance: null };
    (window.speechSynthesis.speak as ReturnType<typeof vi.fn>).mockImplementation(
      (u: {
        text: string;
        voice: unknown;
        onend: (() => void) | null;
        onerror: (() => void) | null;
      }) => {
        captured.utterance = u;
      },
    );

    tts.speak('Hello');
    expect(tts.isSpeaking).toBe(true);

    // Simulate synthesis error followed by duplicate onend — should finalize once
    captured.utterance?.onerror?.();
    captured.utterance?.onend?.();

    expect(tts.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
