import type { IpcMain, IpcMainInvokeEvent, IpcMainEvent, WebContents } from 'electron';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SherpaOnnxStt } from '../speech/sherpa-onnx-stt';
import { SpeechIPCHandler } from './speech-ipc-handler';

interface IpcHandlers {
  [key: string]:
    | ((event: IpcMainEvent | IpcMainInvokeEvent, ...args: unknown[]) => Promise<void> | void)
    | undefined;
}

describe('SpeechIPCHandler', () => {
  let handler: SpeechIPCHandler;
  let mockStt: Partial<SherpaOnnxStt>;
  let mockWebContents: Partial<WebContents>;
  let mockIpcMain: Partial<IpcMain>;
  let ipcHandlers: IpcHandlers;

  beforeEach(() => {
    ipcHandlers = {};

    mockStt = {
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(),
      stop: vi.fn(),
      acceptAudio: vi.fn(),
      onResult: null,
      onError: null,
      onEnd: null,
      isListening: false,
    };

    mockWebContents = {
      send: vi.fn(),
    };

    const handleFn = vi.fn(
      (channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<void>) => {
        ipcHandlers[channel] = fn;
      },
    );
    const onFn = vi.fn((channel: string, fn: (event: unknown, ...args: unknown[]) => void) => {
      ipcHandlers[channel] = fn;
    });
    mockIpcMain = {
      handle: handleFn,
      // @ts-expect-error Vitest Mock assignment type mismatch with Electron IpcMain
      on: onFn,
    };

    handler = new SpeechIPCHandler(
      mockStt as SherpaOnnxStt,
      () => mockWebContents as WebContents | null,
    );
  });

  it('registers IPC handlers when register is called', () => {
    handler.register(mockIpcMain as IpcMain);

    expect(mockIpcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.AUDIO_START, expect.any(Function));
    expect(mockIpcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.AUDIO_STOP, expect.any(Function));
    expect(mockIpcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.AUDIO_DATA, expect.any(Function));
  });

  it('initializes STT and sets up callbacks on AUDIO_START', async () => {
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    expect(mockStt.initialize).toHaveBeenCalled();
    expect(mockStt.start).toHaveBeenCalled();
    expect(mockStt.onResult).not.toBeNull();
    expect(mockStt.onError).not.toBeNull();
    expect(mockStt.onEnd).not.toBeNull();
  });

  it('sends result via IPC when onResult is called', async () => {
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    const result = { transcript: 'hello', isFinal: true, confidence: 0.95 };
    mockStt.onResult?.(result);

    expect(mockWebContents.send).toHaveBeenCalledWith(IPC_CHANNELS.AUDIO_RESULT, result);
  });

  it('sends error via IPC when onError is called', async () => {
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    mockStt.onError?.('Mic access denied');

    expect(mockWebContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AUDIO_ERROR,
      'Mic access denied',
    );
  });

  it('sends end event via IPC when onEnd is called', async () => {
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    mockStt.onEnd?.();

    expect(mockWebContents.send).toHaveBeenCalledWith(IPC_CHANNELS.AUDIO_END);
  });

  it('handles initialization errors gracefully', async () => {
    const initMock = mockStt.initialize as ReturnType<typeof vi.fn>;
    initMock.mockRejectedValue(new Error('Init failed'));
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    expect(mockWebContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AUDIO_ERROR,
      expect.stringContaining('Init failed'),
    );
    expect(mockStt.start).not.toHaveBeenCalled();
  });

  it('wires onError before initialize and aborts start if initialize reports an error via onError', async () => {
    mockStt.initialize = vi.fn(() => {
      mockStt.onError?.('Recognizer init failed');
      return Promise.resolve();
    });
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await startHandler({} as IpcMainInvokeEvent);
    }

    expect(mockWebContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AUDIO_ERROR,
      'Recognizer init failed',
    );
    expect(mockStt.start).not.toHaveBeenCalled();
  });

  it('does not call stt.start when AUDIO_STOP is invoked while initialize is pending', async () => {
    let resolveInit!: () => void;
    mockStt.initialize = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    const stopHandler = ipcHandlers[IPC_CHANNELS.AUDIO_STOP];
    const startPromise = startHandler?.({} as IpcMainInvokeEvent);

    // Cancel capture before initialization resolves
    await stopHandler?.({} as IpcMainInvokeEvent);
    expect(mockStt.stop).toHaveBeenCalledTimes(1);

    resolveInit();
    await startPromise;

    expect(mockStt.start).not.toHaveBeenCalled();
  });

  it('stops STT on AUDIO_STOP', () => {
    handler.register(mockIpcMain as IpcMain);

    const stopHandler = ipcHandlers[IPC_CHANNELS.AUDIO_STOP];
    if (stopHandler !== undefined) {
      void stopHandler({} as IpcMainEvent);
    }

    expect(mockStt.stop).toHaveBeenCalled();
  });

  it('processes audio data and calls acceptAudio', () => {
    handler.register(mockIpcMain as IpcMain);
    Object.defineProperty(mockStt, 'isListening', { value: true, configurable: true });

    const buffer = new ArrayBuffer(4);
    const dataHandler = ipcHandlers[IPC_CHANNELS.AUDIO_DATA];
    if (dataHandler !== undefined) {
      void dataHandler({} as IpcMainEvent, buffer);
    }

    expect(mockStt.acceptAudio).toHaveBeenCalledWith(expect.any(Float32Array));
  });

  it('ignores audio data when not listening', () => {
    handler.register(mockIpcMain as IpcMain);
    Object.defineProperty(mockStt, 'isListening', { value: false, configurable: true });

    const buffer = new ArrayBuffer(4);
    const dataHandler = ipcHandlers[IPC_CHANNELS.AUDIO_DATA];
    if (dataHandler !== undefined) {
      void dataHandler({} as IpcMainEvent, buffer);
    }

    expect(mockStt.acceptAudio).not.toHaveBeenCalled();
  });

  it('ignores non-ArrayBuffer audio data', () => {
    handler.register(mockIpcMain as IpcMain);
    Object.defineProperty(mockStt, 'isListening', { value: true, configurable: true });

    const dataHandler = ipcHandlers[IPC_CHANNELS.AUDIO_DATA];
    if (dataHandler !== undefined) {
      void dataHandler({} as IpcMainEvent, 'not a buffer');
    }

    expect(mockStt.acceptAudio).not.toHaveBeenCalled();
  });

  it('sends error when WebContents is unavailable', async () => {
    handler = new SpeechIPCHandler(mockStt as SherpaOnnxStt, () => null);
    handler.register(mockIpcMain as IpcMain);

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    if (startHandler !== undefined) {
      await expect(startHandler({} as IpcMainInvokeEvent)).resolves.toBeUndefined();
    }

    mockStt.onResult?.({ transcript: 'hi', isFinal: true });
    mockStt.onError?.('err');
    mockStt.onEnd?.();

    mockStt.initialize = vi.fn().mockRejectedValue('string error');
    if (startHandler !== undefined) {
      await expect(startHandler({} as IpcMainInvokeEvent)).resolves.toBeUndefined();
    }

    expect(mockStt.initialize).toHaveBeenCalled();
  });

  it('catches errors thrown by stt.stop and stt.acceptAudio', () => {
    handler.register(mockIpcMain as IpcMain);
    Object.defineProperty(mockStt, 'isListening', { value: true, configurable: true });

    const stopHandler = ipcHandlers[IPC_CHANNELS.AUDIO_STOP];
    mockStt.stop = vi.fn(() => {
      throw new Error('stop error');
    });
    void stopHandler?.({} as IpcMainEvent);

    mockStt.stop = vi.fn(() => {
      throw 'stop string error'; // eslint-disable-line @typescript-eslint/only-throw-error
    });
    void stopHandler?.({} as IpcMainEvent);

    const dataHandler = ipcHandlers[IPC_CHANNELS.AUDIO_DATA];
    mockStt.acceptAudio = vi.fn(() => {
      throw new Error('accept error');
    });
    void dataHandler?.({} as IpcMainEvent, new ArrayBuffer(4));

    mockStt.acceptAudio = vi.fn(() => {
      throw 'accept string error'; // eslint-disable-line @typescript-eslint/only-throw-error
    });
    void dataHandler?.({} as IpcMainEvent, new ArrayBuffer(4));

    expect(mockStt.acceptAudio).toHaveBeenCalled();
  });

  it('skips sending IPC events when WebContents is destroyed and stopCapture tears down active or pending capture', async () => {
    const destroyedSend = vi.fn();
    handler = new SpeechIPCHandler(
      mockStt as SherpaOnnxStt,
      () => ({ send: destroyedSend, isDestroyed: () => true }) as unknown as WebContents,
    );
    handler.register(mockIpcMain as IpcMain);

    let resolveInit!: () => void;
    mockStt.initialize = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
    );

    const startHandler = ipcHandlers[IPC_CHANNELS.AUDIO_START];
    const startPromise = startHandler?.({} as IpcMainInvokeEvent);

    mockStt.onResult?.({ transcript: 'ignored', isFinal: true });
    mockStt.onError?.('ignored error');
    mockStt.onEnd?.();
    expect(destroyedSend).not.toHaveBeenCalled();

    // Window closure calls stopCapture(), invalidating pending initialization and stopping STT
    handler.stopCapture();
    expect(mockStt.stop).toHaveBeenCalledTimes(1);

    resolveInit();
    await startPromise;
    expect(mockStt.start).not.toHaveBeenCalled();
  });
});
