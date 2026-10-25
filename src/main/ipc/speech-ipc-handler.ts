import type { IpcMain, WebContents } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/domain/ipc-channels';
import type { SherpaOnnxStt } from '../speech/sherpa-onnx-stt';

/**
 * SpeechIPCHandler — bridges renderer audio IPC to the main-process SherpaOnnxStt.
 */
export class SpeechIPCHandler {
  constructor(
    private readonly stt: SherpaOnnxStt,
    private readonly getWebContents: () => WebContents | null,
  ) {}

  register(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_CHANNELS.AUDIO_START, async () => {
      try {
        const state = { initFailed: false };

        this.stt.onResult = (result) => {
          const wc = this.getWebContents();
          if (wc !== null) {
            wc.send(IPC_CHANNELS.AUDIO_RESULT, result);
          }
        };

        this.stt.onError = (error) => {
          state.initFailed = true;
          const wc = this.getWebContents();
          if (wc !== null) {
            wc.send(IPC_CHANNELS.AUDIO_ERROR, error);
          }
        };

        this.stt.onEnd = () => {
          const wc = this.getWebContents();
          if (wc !== null) {
            wc.send(IPC_CHANNELS.AUDIO_END);
          }
        };

        await this.stt.initialize();
        if (state.initFailed) {
          return;
        }

        this.stt.start();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SpeechIPCHandler] Failed to start audio:', msg);
        const wc = this.getWebContents();
        if (wc !== null) {
          wc.send(IPC_CHANNELS.AUDIO_ERROR, `Failed to start audio: ${msg}`);
        }
      }
    });

    ipcMain.handle(IPC_CHANNELS.AUDIO_STOP, () => {
      try {
        this.stt.stop();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[SpeechIPCHandler] Error stopping audio:', msg);
      }
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
