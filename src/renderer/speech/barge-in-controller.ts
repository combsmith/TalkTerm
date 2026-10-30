import type { SpeechToText } from '../../shared/types/ports/speech-to-text';
import type { TextToSpeech } from '../../shared/types/ports/text-to-speech';

export type BargeInState = 'idle' | 'speaking' | 'listening' | 'processing';

export class BargeInController {
  private _state: BargeInState = 'idle';

  constructor(
    private readonly stt: SpeechToText,
    private readonly tts: TextToSpeech,
  ) {}

  get state(): BargeInState {
    return this._state;
  }

  startSpeaking(): void {
    this._state = 'speaking';
  }

  handleVoiceDetected(): void {
    if (this._state === 'speaking') {
      this.tts.stop();
      this.stt.start();
      this._state = 'listening';
    }
  }

  handleSpeechEnd(): void {
    if (this._state === 'listening') {
      this._state = 'processing';
    }
  }

  reset(): void {
    this.stt.stop();
    this.tts.stop();
    this._state = 'idle';
  }
}
