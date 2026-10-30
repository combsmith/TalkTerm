/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks are not class methods */
import { describe, it, expect, vi } from 'vitest';
import type { SpeechToText } from '../../shared/types/ports/speech-to-text';
import type { TextToSpeech } from '../../shared/types/ports/text-to-speech';
import { BargeInController } from './barge-in-controller';

function createMockStt(): SpeechToText {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    onResult: null,
    onError: null,
    onEnd: null,
    isListening: false,
  };
}

function createMockTts(): TextToSpeech {
  return { speak: vi.fn(), stop: vi.fn(), onEnd: null, isSpeaking: false };
}

describe('BargeInController', () => {
  it('starts in idle state', () => {
    const controller = new BargeInController(createMockStt(), createMockTts());
    expect(controller.state).toBe('idle');
  });

  it('transitions to speaking', () => {
    const controller = new BargeInController(createMockStt(), createMockTts());
    controller.startSpeaking();
    expect(controller.state).toBe('speaking');
  });

  it('stops TTS and starts STT on voice detected during speaking', () => {
    const stt = createMockStt();
    const tts = createMockTts();
    const controller = new BargeInController(stt, tts);
    controller.startSpeaking();
    controller.handleVoiceDetected();
    expect(tts.stop).toHaveBeenCalled();
    expect(stt.start).toHaveBeenCalled();
    expect(controller.state).toBe('listening');
  });

  it('does not interrupt when idle', () => {
    const stt = createMockStt();
    const tts = createMockTts();
    const controller = new BargeInController(stt, tts);
    controller.handleVoiceDetected();
    expect(tts.stop).not.toHaveBeenCalled();
    expect(controller.state).toBe('idle');
  });

  it('transitions to processing after speech ends', () => {
    const controller = new BargeInController(createMockStt(), createMockTts());
    controller.startSpeaking();
    controller.handleVoiceDetected();
    controller.handleSpeechEnd();
    expect(controller.state).toBe('processing');
  });

  it('resets to idle', () => {
    const stt = createMockStt();
    const tts = createMockTts();
    const controller = new BargeInController(stt, tts);
    controller.startSpeaking();
    controller.handleVoiceDetected();
    controller.reset();
    expect(controller.state).toBe('idle');
    expect(stt.stop).toHaveBeenCalled();
    expect(tts.stop).toHaveBeenCalled();
  });
});
