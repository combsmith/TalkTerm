import type { SpeechToText, SpeechToTextResult } from '../../shared/types/ports/speech-to-text';

/**
 * IpcSpeechStt — renderer-side STT that captures mic audio via getUserMedia,
 * streams PCM to the main process via IPC, and receives transcription results back.
 *
 * Replaces WebSpeechStt which doesn't work in Electron (Google servers unreachable).
 */
export class IpcSpeechStt implements SpeechToText {
  private _isListening = false;
  private captureGeneration = 0;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  /* eslint-disable @typescript-eslint/no-deprecated -- ScriptProcessorNode used for PCM mic capture */
  private processorNode: ScriptProcessorNode | null = null;
  /* eslint-enable @typescript-eslint/no-deprecated */
  private unsubResult: (() => void) | null = null;
  private unsubError: (() => void) | null = null;
  private unsubEnd: (() => void) | null = null;

  onResult: ((result: SpeechToTextResult) => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onEnd: (() => void) | null = null;

  get isListening(): boolean {
    return this._isListening;
  }

  start(): void {
    if (this._isListening) return;
    this._isListening = true;

    // Subscribe to IPC results from main process
    this.unsubResult = window.electronAPI.onAudioResult((result) => {
      this.onResult?.(result);
    });
    this.unsubError = window.electronAPI.onAudioError((error) => {
      this.onError?.(new Error(error));
      this.stop();
    });
    this.unsubEnd = window.electronAPI.onAudioEnd(() => {
      this._isListening = false;
      this.captureGeneration++;
      this.teardownCapture();
      this.onEnd?.();
    });

    // Start audio capture and IPC streaming
    const generation = ++this.captureGeneration;
    void this.startCapture(generation);
  }

  stop(): void {
    if (
      !this._isListening &&
      this.audioContext === null &&
      this.mediaStream === null &&
      this.unsubResult === null
    ) {
      return;
    }
    this._isListening = false;
    this.captureGeneration++;
    this.teardownCapture();

    // Tell main process to stop
    void window.electronAPI.stopAudioCapture();
  }

  private teardownCapture(): void {
    // Stop audio capture
    if (this.processorNode !== null) {
      /* eslint-disable @typescript-eslint/no-deprecated -- ScriptProcessorNode cleanup */
      this.processorNode.onaudioprocess = null;
      /* eslint-enable @typescript-eslint/no-deprecated */
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    if (this.audioContext !== null) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream !== null) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    // Unsubscribe IPC listeners
    this.unsubResult?.();
    this.unsubError?.();
    this.unsubEnd?.();
    this.unsubResult = null;
    this.unsubError = null;
    this.unsubEnd = null;
  }

  private isGenerationActive(generation: number): boolean {
    return this._isListening && this.captureGeneration === generation;
  }

  private async startCapture(generation: number): Promise<void> {
    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!this.isGenerationActive(generation)) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      // Tell main process to start the recognizer
      await window.electronAPI.startAudioCapture();
      if (!this.isGenerationActive(generation)) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      this.mediaStream = stream;

      // Set up AudioContext → ScriptProcessorNode → IPC pipeline
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode = source;

      // Use ScriptProcessorNode — simpler than AudioWorklet (which requires a separate file)
      /* eslint-disable @typescript-eslint/no-deprecated -- ScriptProcessorNode is adequate for this mic capture use case */
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processorNode = processor;
      processor.onaudioprocess = (event): void => {
        if (!this._isListening) return;
        const inputData = event.inputBuffer.getChannelData(0);
        /* eslint-enable @typescript-eslint/no-deprecated */
        // Copy the Float32 PCM data and send to main process
        const pcmCopy = new Float32Array(inputData.length);
        pcmCopy.set(inputData);
        window.electronAPI.sendAudioData(pcmCopy);
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      console.debug('[IpcSpeechStt] Audio capture started (16kHz mono)');
    } catch (err) {
      if (this.captureGeneration !== generation) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[IpcSpeechStt] Failed to start audio capture:', msg);
      this._isListening = false;
      this.teardownCapture();
      this.onError?.(new Error(`Microphone access failed: ${msg}`));
    }
  }
}
