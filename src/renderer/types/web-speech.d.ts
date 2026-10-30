// Web Speech API type declarations for browsers that support it
interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}

// Electron extends the standard File interface with a filesystem path
interface File {
  readonly path: string;
}
