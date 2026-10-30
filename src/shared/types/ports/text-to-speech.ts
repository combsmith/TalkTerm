export interface TextToSpeech {
  speak(text: string, voiceName?: string): void;
  stop(): void;
  onEnd: (() => void) | null;
  readonly isSpeaking: boolean;
}
