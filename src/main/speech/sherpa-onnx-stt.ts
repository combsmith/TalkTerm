/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- sherpa-onnx-node types not available */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { app } from 'electron';

/**
 * SherpaOnnxStt — main-process speech-to-text using sherpa-onnx-node.
 * Wraps the OnlineRecognizer for streaming transcription.
 *
 * Architecture boundary: Only this file imports sherpa-onnx-node.
 */

const MODEL_DIR_NAME = 'sherpa-onnx-model';
const MODEL_FILES = [
  'encoder-epoch-99-avg-1.int8.onnx',
  'decoder-epoch-99-avg-1.int8.onnx',
  'joiner-epoch-99-avg-1.int8.onnx',
  'tokens.txt',
] as const;
const MODEL_MIN_BYTES: Record<(typeof MODEL_FILES)[number], number> = {
  'encoder-epoch-99-avg-1.int8.onnx': 1_000_000,
  'decoder-epoch-99-avg-1.int8.onnx': 100_000,
  'joiner-epoch-99-avg-1.int8.onnx': 100_000,
  'tokens.txt': 100,
};
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MODEL_BASE_URL =
  'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17/resolve/main';

interface SherpaResult {
  transcript: string;
  isFinal: boolean;
}

export type SherpaResultCallback = (result: SherpaResult) => void;
export type SherpaErrorCallback = (error: string) => void;
export type SherpaEndCallback = () => void;

export interface SherpaOnnxSttOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sherpa-onnx-node types not available
  createRecognizer?: (config: any) => any;
}

export class SherpaOnnxStt {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sherpa-onnx-node types not available
  private recognizer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stream: any = null;
  private _isListening = false;
  private lastText = '';
  private decodeTimer: ReturnType<typeof setInterval> | null = null;
  private initPromise: Promise<void> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly createRecognizerFn: (config: any) => any;

  onResult: SherpaResultCallback | null = null;
  onError: SherpaErrorCallback | null = null;
  onEnd: SherpaEndCallback | null = null;

  constructor(options?: SherpaOnnxSttOptions) {
    this.createRecognizerFn =
      options?.createRecognizer ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((config: any): any => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module loaded at runtime
        const sherpa = require('sherpa-onnx-node') as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          OnlineRecognizer: new (c: any) => any;
        };
        return new sherpa.OnlineRecognizer(config);
      });
  }

  get isListening(): boolean {
    return this._isListening;
  }

  /** Ensure model files exist, downloading if needed. Returns model directory. */
  async ensureModel(): Promise<string> {
    const modelDir = path.join(app.getPath('userData'), MODEL_DIR_NAME);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    for (const file of MODEL_FILES) {
      const filePath = path.join(modelDir, file);
      const minBytes = MODEL_MIN_BYTES[file];
      const hasValidFile = fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes;
      if (!hasValidFile) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        console.log(`[SherpaOnnxStt] Downloading ${file}...`);
        await this.downloadFile(`${MODEL_BASE_URL}/${file}`, filePath);
        console.log(`[SherpaOnnxStt] Downloaded ${file}`);
      }
    }

    return modelDir;
  }

  /** Initialize the recognizer. Must be called before start(). */
  async initialize(): Promise<void> {
    if (this.recognizer !== null) return;
    if (this.initPromise !== null) {
      return this.initPromise;
    }

    this.initPromise = this.performInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async performInitialize(): Promise<void> {
    const modelDir = await this.ensureModel();

    const config = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: path.join(modelDir, 'encoder-epoch-99-avg-1.int8.onnx'),
          decoder: path.join(modelDir, 'decoder-epoch-99-avg-1.int8.onnx'),
          joiner: path.join(modelDir, 'joiner-epoch-99-avg-1.int8.onnx'),
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
      },
      decodingMethod: 'greedy_search',
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
    };

    try {
      this.recognizer = this.createRecognizerFn(config);
      console.log('[SherpaOnnxStt] Recognizer initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SherpaOnnxStt] Failed to initialize:', msg);
      const errorMsg = `Failed to initialize speech recognition: ${msg}`;
      this.onError?.(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /** Start listening — creates a new stream and begins decode loop. */
  start(): void {
    if (this._isListening) return;
    if (this.recognizer === null) {
      this.onError?.('Speech recognizer not initialized. Call initialize() first.');
      return;
    }

    this.stream = this.recognizer.createStream();
    this._isListening = true;
    this.lastText = '';

    // Periodic decode loop — processes buffered audio every 100ms
    this.decodeTimer = setInterval(() => {
      this.processAudio();
    }, 100);

    console.debug('[SherpaOnnxStt] Started listening');
  }

  /** Accept PCM audio data (Float32Array, 16kHz mono). */
  acceptAudio(samples: Float32Array): void {
    if (this.stream === null || !this._isListening) return;

    this.stream.acceptWaveform({ sampleRate: 16000, samples });
  }

  /** Stop listening and clean up the stream. */
  stop(): void {
    if (!this._isListening) return;
    this._isListening = false;

    if (this.decodeTimer !== null) {
      clearInterval(this.decodeTimer);
      this.decodeTimer = null;
    }

    // Flush remaining audio with tail padding
    if (this.stream !== null) {
      const tailPadding = new Float32Array(16000 * 0.3); // 300ms silence

      this.stream.acceptWaveform({ sampleRate: 16000, samples: tailPadding });
      this.processAudio();
    }

    this.stream = null;
    console.debug('[SherpaOnnxStt] Stopped listening');
    this.onEnd?.();
  }

  /** Process buffered audio — called by the decode timer. */
  private processAudio(): void {
    if (this.recognizer === null || this.stream === null) return;

    try {
      while (this.recognizer.isReady(this.stream) as boolean) {
        this.recognizer.decode(this.stream);
      }

      const isEndpoint = this.recognizer.isEndpoint(this.stream) as boolean;

      const result = this.recognizer.getResult(this.stream) as { text: string };
      const text = result.text.trim();

      // Emit interim results when text changes
      if (text.length > 0 && text !== this.lastText) {
        this.lastText = text;
        this.onResult?.({ transcript: text, isFinal: false });
      }

      // Endpoint detected — emit final result and reset stream
      if (isEndpoint) {
        if (text.length > 0) {
          this.onResult?.({ transcript: text, isFinal: true });
          this.lastText = '';
        }

        this.recognizer.reset(this.stream);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SherpaOnnxStt] Error processing audio:', msg);
      this.onError?.(`Speech processing error: ${msg}`);
      this.stop();
    }
  }

  /** Download a file from URL to local path atomically, following redirects. */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const tempPath = `${destPath}.tmp`;
    const cleanupTemp = (): void => {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    };

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      const fail = (err: Error): void => {
        file.close();
        cleanupTemp();
        reject(err);
      };

      const request = (reqUrl: string, redirectsLeft: number): void => {
        const req = https.get(reqUrl, (response) => {
          // Follow redirects (HuggingFace uses 301, 302, 303, 307, 308)
          const code = response.statusCode ?? 0;
          if (code >= 300 && code < 400 && response.headers.location !== undefined) {
            if (redirectsLeft <= 0) {
              response.resume();
              fail(new Error(`Too many redirects downloading ${reqUrl}`));
              return;
            }
            const redirectUrl = new URL(response.headers.location, reqUrl).toString();
            response.resume();
            request(redirectUrl, redirectsLeft - 1);
            return;
          }
          if (code !== 200) {
            response.resume();
            fail(new Error(`HTTP ${String(code)} downloading ${reqUrl}`));
            return;
          }
          file.on('finish', () => {
            file.close();
            fs.renameSync(tempPath, destPath);
            resolve();
          });
          response.pipe(file);
        });

        req.on('error', (err) => {
          fail(err);
        });

        req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
          req.destroy(new Error(`Timeout downloading ${reqUrl}`));
        });
      };

      request(url, MAX_REDIRECTS);
    });
  }
}
