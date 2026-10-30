/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Web Speech API types are not fully typed in TypeScript */
import type { SpeechToText, SpeechToTextResult } from '../../shared/types/ports/speech-to-text';

export class WebSpeechStt implements SpeechToText {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognition type varies by browser
  private recognition: any = null;
  private _isListening = false;

  onResult: ((result: SpeechToTextResult) => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onEnd: (() => void) | null = null;

  get isListening(): boolean {
    return this._isListening;
  }

  start(): void {
    if (this._isListening) return;
    console.debug('[WebSpeechStt] start() called');
    console.debug(
      '[WebSpeechStt] SpeechRecognition available:',
      window.SpeechRecognition !== undefined,
    );
    console.debug(
      '[WebSpeechStt] webkitSpeechRecognition available:',
      window.webkitSpeechRecognition !== undefined,
    );

    const SpeechRecognitionClass = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (SpeechRecognitionClass === undefined) {
      console.error('[WebSpeechStt] Speech recognition not supported in this environment');
      this.onError?.(new Error('Speech recognition not supported'));
      return;
    }
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = (): void => {
      console.debug('[WebSpeechStt] recognition.onstart fired — mic is active');
    };

    this.recognition.onaudiostart = (): void => {
      console.debug('[WebSpeechStt] recognition.onaudiostart — audio capture started');
    };

    this.recognition.onspeechstart = (): void => {
      console.debug('[WebSpeechStt] recognition.onspeechstart — speech detected');
    };

    this.recognition.onresult = (event: { results: SpeechRecognitionResultList }): void => {
      const result = event.results[event.results.length - 1];
      if (result !== undefined) {
        console.debug(
          '[WebSpeechStt] onresult:',
          result[0]?.transcript,
          'isFinal:',
          result.isFinal,
        );
        this.onResult?.({
          transcript: result[0]?.transcript ?? '',
          isFinal: result.isFinal,
        });
      }
    };

    this.recognition.onerror = (event: { error: string; message?: string }): void => {
      console.error('[WebSpeechStt] onerror:', event.error, event.message ?? '');
      if (event.error === 'network') {
        this.onError?.(
          new Error(
            'network: In-app speech recognition is not available in Electron. ' +
              'Use macOS Dictation instead: System Settings → Keyboard → Dictation, ' +
              'then press 🌐🌐 (Globe key twice) while the text field is focused.',
          ),
        );
      } else {
        this.onError?.(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    this.recognition.onend = (): void => {
      console.debug('[WebSpeechStt] recognition.onend — stopped');
      this._isListening = false;
      this.onEnd?.();
    };

    try {
      this.recognition.start();
      this._isListening = true;
      console.debug('[WebSpeechStt] recognition.start() called successfully');
    } catch (err) {
      console.error('[WebSpeechStt] recognition.start() threw:', err);
      this.onError?.(
        new Error(
          `Speech recognition failed to start: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  stop(): void {
    if (this.recognition !== null) {
      this.recognition.stop();
      this._isListening = false;
    }
  }
}
