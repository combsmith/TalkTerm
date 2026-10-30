import type { IpcMain, WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SherpaOnnxStt } from '../speech/sherpa-onnx-stt';

/**
 * SpeechIPCHandler — bridges renderer audio IPC to the main-process SherpaOnnxStt.
 */
export class SpeechIPCHandler {
  private captureGeneration = 0;

  constructor(
    private readonly stt: SherpaOnnxStt,
    private readonly getWebContents: () => WebContents | null,
  ) {}

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    const wc = this.getWebContents();
    if (wc === null) {
      return;
    }
    const maybeDestroyable = wc as { isDestroyed?: () => boolean };
    if (typeof maybeDestroyable.isDestroyed === 'function' && maybeDestroyable.isDestroyed()) {
      return;
    }
    wc.send(channel, ...args);
  }

  /**
   * Invalidates any pending initialization and stops active audio capture
   * (e.g. when the renderer requests AUDIO_STOP or the BrowserWindow closes).
   */
  stopCapture(): void {
    this.captureGeneration++;
    try {
      this.stt.stop();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SpeechIPCHandler] Error stopping audio:', msg);
    }
  }

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.AUDIO_START, async () => {
      try {
        const generation = ++this.captureGeneration;
        const state = { initFailed: false };

        this.stt.onResult = (result) => {
          this.sendToRenderer(IPC_CHANNELS.AUDIO_RESULT, result);
        };

        this.stt.onError = (error) => {
          state.initFailed = true;
          this.sendToRenderer(IPC_CHANNELS.AUDIO_ERROR, error);
        };

        this.stt.onEnd = () => {
          this.sendToRenderer(IPC_CHANNELS.AUDIO_END);
        };

        await this.stt.initialize();
        if (state.initFailed || generation !== this.captureGeneration) {
          return;
        }

        this.stt.start();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SpeechIPCHandler] Failed to start audio:', msg);
        this.sendToRenderer(IPC_CHANNELS.AUDIO_ERROR, `Failed to start audio: ${msg}`);
      }
    });

    ipcMain.handle(IPC_CHANNELS.AUDIO_STOP, () => {
      this.stopCapture();
    });

    // Audio data arrives as ArrayBuffer from renderer — convert to Float32Array
    ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, buffer: ArrayBuffer) => {
      if (this.stt.isListening && buffer instanceof ArrayBuffer) {
        try {
          const samples = new Float32Array(buffer);
          this.stt.acceptAudio(samples);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[SpeechIPCHandler] Error processing audio data:', msg);
        }
      }
    });
  }
}
