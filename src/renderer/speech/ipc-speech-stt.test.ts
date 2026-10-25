/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- mocking Web Audio API and navigator.mediaDevices */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpeechToTextResult } from '../../shared/types/ports/speech-to-text';
import { IpcSpeechStt } from './ipc-speech-stt';

describe('IpcSpeechStt', () => {
  let resultCallback: ((result: SpeechToTextResult) => void) | null;
  let errorCallback: ((error: string) => void) | null;
  let endCallback: (() => void) | null;
  let unsubResult: ReturnType<typeof vi.fn>;
  let unsubError: ReturnType<typeof vi.fn>;
  let unsubEnd: ReturnType<typeof vi.fn>;
  let mockTrackStop: ReturnType<typeof vi.fn>;
  let mockSourceConnect: ReturnType<typeof vi.fn>;
  let mockSourceDisconnect: ReturnType<typeof vi.fn>;
  let mockProcessorConnect: ReturnType<typeof vi.fn>;
  let mockProcessorDisconnect: ReturnType<typeof vi.fn>;
  let mockAudioContextClose: ReturnType<typeof vi.fn>;
  let mockProcessor: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onaudioprocess: ((event: any) => void) | null;
  };
  let mockGetUserMedia: ReturnType<typeof vi.fn>;
  let mockStartAudioCapture: ReturnType<typeof vi.fn>;
  let mockStopAudioCapture: ReturnType<typeof vi.fn>;
  let mockSendAudioData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resultCallback = null;
    errorCallback = null;
    endCallback = null;
    unsubResult = vi.fn();
    unsubError = vi.fn();
    unsubEnd = vi.fn();
    mockTrackStop = vi.fn();
    mockSourceConnect = vi.fn();
    mockSourceDisconnect = vi.fn();
    mockProcessorConnect = vi.fn();
    mockProcessorDisconnect = vi.fn();
    mockAudioContextClose = vi.fn().mockResolvedValue(undefined);
    mockProcessor = {
      connect: mockProcessorConnect,
      disconnect: mockProcessorDisconnect,
      onaudioprocess: null,
    };

    mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: mockTrackStop }],
    });
    mockStartAudioCapture = vi.fn().mockResolvedValue(undefined);
    mockStopAudioCapture = vi.fn().mockResolvedValue(undefined);
    mockSendAudioData = vi.fn();

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    class MockAudioContext {
      destination = {};
      createMediaStreamSource = vi.fn(() => ({
        connect: mockSourceConnect,
        disconnect: mockSourceDisconnect,
      }));
      createScriptProcessor = vi.fn(() => mockProcessor);
      close = mockAudioContextClose;
    }

    vi.stubGlobal('AudioContext', MockAudioContext);

    Object.defineProperty(window, 'electronAPI', {
      value: {
        onAudioResult: vi.fn((cb: (result: SpeechToTextResult) => void) => {
          resultCallback = cb;
          return unsubResult;
        }),
        onAudioError: vi.fn((cb: (error: string) => void) => {
          errorCallback = cb;
          return unsubError;
        }),
        onAudioEnd: vi.fn((cb: () => void) => {
          endCallback = cb;
          return unsubEnd;
        }),
        startAudioCapture: mockStartAudioCapture,
        stopAudioCapture: mockStopAudioCapture,
        sendAudioData: mockSendAudioData,
      },
      writable: true,
      configurable: true,
    });
  });

  it('starts and streams audio chunks via IPC', async () => {
    const stt = new IpcSpeechStt();
    const onResult = vi.fn();
    stt.onResult = onResult;

    stt.start();
    expect(stt.isListening).toBe(true);

    // Second start while listening is a no-op
    stt.start();
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

    // Wait for async startCapture() to complete
    await vi.waitFor(() => {
      expect(mockProcessorConnect).toHaveBeenCalled();
    });

    // Simulate audio frame
    const samples = new Float32Array([0.1, -0.2, 0.3]);
    mockProcessor.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => samples,
      },
    });
    expect(mockSendAudioData).toHaveBeenCalledTimes(1);

    // Simulate IPC result
    resultCallback?.({ transcript: 'hello', isFinal: true });
    expect(onResult).toHaveBeenCalledWith({ transcript: 'hello', isFinal: true });

    // Stop cleans up processorNode, sourceNode, audioContext, mediaStream, and IPC listeners
    stt.stop();
    expect(stt.isListening).toBe(false);
    expect(mockProcessor.onaudioprocess).toBeNull();
    expect(mockProcessorDisconnect).toHaveBeenCalledTimes(1);
    expect(mockSourceDisconnect).toHaveBeenCalledTimes(1);
    expect(mockAudioContextClose).toHaveBeenCalledTimes(1);
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(unsubResult).toHaveBeenCalledTimes(1);
    expect(unsubError).toHaveBeenCalledTimes(1);
    expect(unsubEnd).toHaveBeenCalledTimes(1);
    expect(mockStopAudioCapture).toHaveBeenCalledTimes(1);

    // Second stop is a no-op
    stt.stop();
    expect(mockStopAudioCapture).toHaveBeenCalledTimes(1);
  });

  it('handles IPC error and end callbacks and tears down capture on audio end', async () => {
    const stt = new IpcSpeechStt();
    const onError = vi.fn();
    const onEnd = vi.fn();
    stt.onError = onError;
    stt.onEnd = onEnd;

    stt.start();
    await vi.waitFor(() => {
      expect(mockProcessorConnect).toHaveBeenCalled();
    });

    errorCallback?.('ASR failure');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ASR failure' }));
    expect(mockStopAudioCapture).toHaveBeenCalledTimes(1);

    // Restart and trigger endCallback from main process
    mockTrackStop.mockClear();
    mockAudioContextClose.mockClear();
    mockProcessorDisconnect.mockClear();
    mockStopAudioCapture.mockClear();

    stt.start();
    await vi.waitFor(() => {
      expect(mockProcessorConnect).toHaveBeenCalledTimes(2);
    });

    endCallback?.();
    expect(stt.isListening).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(mockAudioContextClose).toHaveBeenCalledTimes(1);
    expect(mockProcessorDisconnect).toHaveBeenCalledTimes(1);
    // Main process already ended; do not send redundant stopAudioCapture
    expect(mockStopAudioCapture).not.toHaveBeenCalled();
  });

  it('aborts startCapture cleanly if stop() is called while getUserMedia is pending', async () => {
    let resolveStream!: (stream: any) => void;
    mockGetUserMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );

    const stt = new IpcSpeechStt();
    stt.start();
    stt.stop();

    resolveStream({ getTracks: () => [{ stop: mockTrackStop }] });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(mockStartAudioCapture).not.toHaveBeenCalled();
  });

  it('aborts startCapture cleanly if stop() is called while startAudioCapture is pending', async () => {
    let resolveCapture!: () => void;
    mockStartAudioCapture.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveCapture = resolve;
      }),
    );

    const stt = new IpcSpeechStt();
    stt.start();

    await vi.waitFor(() => {
      expect(mockStartAudioCapture).toHaveBeenCalledTimes(1);
    });

    stt.stop();
    resolveCapture();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockProcessorConnect).not.toHaveBeenCalled();
  });

  it('reports error when getUserMedia rejects', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    const stt = new IpcSpeechStt();
    const onError = vi.fn();
    stt.onError = onError;

    stt.start();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Microphone access failed: Permission denied'),
        }),
      );
    });
    expect(stt.isListening).toBe(false);
  });
});
