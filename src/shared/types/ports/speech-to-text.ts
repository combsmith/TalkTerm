export interface SpeechToTextResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SpeechToText {
  start(): void;
  stop(): void;
  onResult: ((result: SpeechToTextResult) => void) | null;
  onError: ((error: Error) => void) | null;
  onEnd: (() => void) | null;
  readonly isListening: boolean;
}
