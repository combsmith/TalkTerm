/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- test mocks for https, fs, and recognizer */
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SherpaOnnxStt } from './sherpa-onnx-stt';

const EXPECTED_MODEL_DIR = path.join('/tmp/user-data', 'sherpa-onnx-model');

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockStatSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockRenameSync = vi.fn();
const mockCreateWriteStream = vi.fn();
const mockHttpsGet = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/user-data'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    statSync: (...args: unknown[]) => mockStatSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
    renameSync: (...args: unknown[]) => mockRenameSync(...args),
    createWriteStream: (...args: unknown[]) => mockCreateWriteStream(...args),
  },
}));

vi.mock('node:https', () => ({
  default: {
    get: (...args: unknown[]) => mockHttpsGet(...args),
  },
}));

function createFakeFileStream(): EventEmitter & { close: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
  emitter.close = vi.fn();
  return emitter;
}

function createFakeRequest(): EventEmitter & {
  setTimeout: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  req.setTimeout = vi.fn();
  req.destroy = vi.fn((err?: Error) => {
    if (err !== undefined) {
      req.emit('error', err);
    }
  });
  return req;
}

describe('SherpaOnnxStt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 2_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ensureModel and downloadFile', () => {
    it('skips download when all model files exist with sufficient size', async () => {
      const stt = new SherpaOnnxStt();
      const dir = await stt.ensureModel();

      expect(dir).toBe(EXPECTED_MODEL_DIR);
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });

    it('creates model directory if missing, unlinks truncated files, and downloads atomically', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === EXPECTED_MODEL_DIR) return false;
        if (p.endsWith('encoder-epoch-99-avg-1.int8.onnx')) return true; // exists but truncated
        if (p.endsWith('.tmp')) return false;
        return true;
      });
      mockStatSync.mockImplementation((p: string) => {
        if (p.endsWith('encoder-epoch-99-avg-1.int8.onnx')) return { size: 10 }; // too small
        return { size: 2_000_000 };
      });

      const fileStream = createFakeFileStream();
      mockCreateWriteStream.mockReturnValue(fileStream);

      let callCount = 0;
      mockHttpsGet.mockImplementation((_url: string, cb: (res: any) => void) => {
        callCount++;
        const req = createFakeRequest();
        if (callCount === 1) {
          cb({
            statusCode: 302,
            headers: { location: 'https://cdn.example.com/final.onnx' },
            resume: vi.fn(),
            pipe: vi.fn(),
          });
          return req;
        }
        const res = {
          statusCode: 200,
          headers: {},
          resume: vi.fn(),
          pipe: vi.fn(() => {
            fileStream.emit('finish');
          }),
        };
        cb(res);
        return req;
      });

      const stt = new SherpaOnnxStt();
      await stt.ensureModel();

      expect(mockMkdirSync).toHaveBeenCalledWith(EXPECTED_MODEL_DIR, {
        recursive: true,
      });
      expect(mockUnlinkSync).toHaveBeenCalledWith(
        path.join(EXPECTED_MODEL_DIR, 'encoder-epoch-99-avg-1.int8.onnx'),
      );
      expect(mockRenameSync).toHaveBeenCalledWith(
        path.join(EXPECTED_MODEL_DIR, 'encoder-epoch-99-avg-1.int8.onnx.tmp'),
        path.join(EXPECTED_MODEL_DIR, 'encoder-epoch-99-avg-1.int8.onnx'),
      );
    });

    it('follows redirects up to MAX_REDIRECTS and rejects on redirect loop', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.endsWith('tokens.txt')) return false;
        if (p.endsWith('.tmp')) return true;
        return true;
      });

      const fileStream = createFakeFileStream();
      mockCreateWriteStream.mockReturnValue(fileStream);

      mockHttpsGet.mockImplementation((_url: string, cb: (res: any) => void) => {
        const req = createFakeRequest();
        cb({
          statusCode: 302,
          headers: { location: 'https://cdn.example.com/redirect' },
          resume: vi.fn(),
          pipe: vi.fn(),
        });
        return req;
      });

      const stt = new SherpaOnnxStt();
      await expect(stt.ensureModel()).rejects.toThrow('Too many redirects');
      expect(mockUnlinkSync).toHaveBeenCalledWith(path.join(EXPECTED_MODEL_DIR, 'tokens.txt.tmp'));
    });

    it('rejects and cleans up temp file on non-200 HTTP status', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.endsWith('tokens.txt')) return false;
        if (p.endsWith('.tmp')) return true;
        return true;
      });

      const fileStream = createFakeFileStream();
      mockCreateWriteStream.mockReturnValue(fileStream);

      mockHttpsGet.mockImplementation((_url: string, cb: (res: any) => void) => {
        const req = createFakeRequest();
        cb({
          statusCode: 503,
          headers: {},
          resume: vi.fn(),
          pipe: vi.fn(),
        });
        return req;
      });

      const stt = new SherpaOnnxStt();
      await expect(stt.ensureModel()).rejects.toThrow('HTTP 503');
      expect(mockUnlinkSync).toHaveBeenCalledWith(path.join(EXPECTED_MODEL_DIR, 'tokens.txt.tmp'));
    });

    it('rejects when request times out even if temp file was not created', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.endsWith('tokens.txt')) return false;
        if (p.endsWith('.tmp')) return false;
        return true;
      });

      const fileStream = createFakeFileStream();
      mockCreateWriteStream.mockReturnValue(fileStream);

      mockHttpsGet.mockImplementation(() => {
        const req = createFakeRequest();
        req.setTimeout.mockImplementation((_ms: number, timeoutCb: () => void) => {
          timeoutCb();
        });
        return req;
      });

      const stt = new SherpaOnnxStt();
      await expect(stt.ensureModel()).rejects.toThrow('Timeout downloading');
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('rejects and cleans up temp file when destination WriteStream emits an error', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p.endsWith('tokens.txt')) return false;
        if (p.endsWith('.tmp')) return true;
        return true;
      });

      const fileStream = createFakeFileStream();
      mockCreateWriteStream.mockReturnValue(fileStream);

      mockHttpsGet.mockImplementation((_url: string, cb: (res: any) => void) => {
        const req = createFakeRequest();
        cb({
          statusCode: 200,
          headers: {},
          resume: vi.fn(),
          pipe: vi.fn(() => {
            fileStream.emit('error', new Error('ENOSPC: no space left on device'));
          }),
        });
        return req;
      });

      const stt = new SherpaOnnxStt();
      await expect(stt.ensureModel()).rejects.toThrow('ENOSPC');
      expect(mockUnlinkSync).toHaveBeenCalledWith(path.join(EXPECTED_MODEL_DIR, 'tokens.txt.tmp'));
    });
  });

  describe('initialize, start, acceptAudio, processAudio, and stop', () => {
    it('reports error when start() is called before initialize()', () => {
      const stt = new SherpaOnnxStt();
      const onError = vi.fn();
      stt.onError = onError;

      stt.start();
      expect(stt.isListening).toBe(false);
      expect(onError).toHaveBeenCalledWith(
        'Speech recognizer not initialized. Call initialize() first.',
      );
    });

    it('reports error and throws when recognizer creation fails', async () => {
      const stt = new SherpaOnnxStt({
        createRecognizer: () => {
          throw new Error('ONNX load failed');
        },
      });
      const onError = vi.fn();
      stt.onError = onError;

      await expect(stt.initialize()).rejects.toThrow(
        'Failed to initialize speech recognition: ONNX load failed',
      );
      expect(onError).toHaveBeenCalledWith(
        'Failed to initialize speech recognition: ONNX load failed',
      );
    });

    it('streams audio, emits interim and final endpoint results, and stops cleanly', async () => {
      const mockStream = {
        acceptWaveform: vi.fn(),
      };
      let readyCalls = 0;
      let endpoint = false;
      let currentText = 'hello';

      const mockRecognizer = {
        createStream: vi.fn(() => mockStream),
        isReady: vi.fn(() => {
          readyCalls++;
          return readyCalls % 2 === 1;
        }),
        decode: vi.fn(),
        isEndpoint: vi.fn(() => endpoint),
        getResult: vi.fn(() => ({ text: currentText })),
        reset: vi.fn(),
      };

      const createRecognizer = vi.fn(() => mockRecognizer);
      const stt = new SherpaOnnxStt({ createRecognizer });
      const onResult = vi.fn();
      const onEnd = vi.fn();
      stt.onResult = onResult;
      stt.onEnd = onEnd;

      await stt.initialize();
      // Second initialize is a no-op
      await stt.initialize();
      expect(createRecognizer).toHaveBeenCalledTimes(1);

      stt.start();
      expect(stt.isListening).toBe(true);
      // Second start while listening is a no-op
      stt.start();
      expect(mockRecognizer.createStream).toHaveBeenCalledTimes(1);

      const samples = new Float32Array([0.1, 0.2]);
      stt.acceptAudio(samples);
      expect(mockStream.acceptWaveform).toHaveBeenCalledWith({
        sampleRate: 16000,
        samples,
      });

      // Advance timer to trigger first decode tick (interim result)
      vi.advanceTimersByTime(100);
      expect(mockRecognizer.decode).toHaveBeenCalled();
      expect(onResult).toHaveBeenCalledWith({ transcript: 'hello', isFinal: false });

      // Endpoint reached on next tick
      currentText = 'hello world';
      endpoint = true;
      vi.advanceTimersByTime(100);
      expect(onResult).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: false });
      expect(onResult).toHaveBeenCalledWith({ transcript: 'hello world', isFinal: true });
      expect(mockRecognizer.reset).toHaveBeenCalledWith(mockStream);

      // Stop flushes tail padding and emits onEnd
      endpoint = false;
      currentText = '';
      stt.stop();
      expect(stt.isListening).toBe(false);
      expect(onEnd).toHaveBeenCalledTimes(1);

      // acceptAudio while not listening is a no-op
      mockStream.acceptWaveform.mockClear();
      stt.acceptAudio(new Float32Array([0.5]));
      expect(mockStream.acceptWaveform).not.toHaveBeenCalled();

      // Second stop is a no-op
      stt.stop();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('handles errors during processAudio by emitting onError and stopping', async () => {
      const mockStream = {
        acceptWaveform: vi.fn(),
      };
      const mockRecognizer = {
        createStream: vi.fn(() => mockStream),
        isReady: vi.fn(() => {
          throw new Error('decode crash');
        }),
      };

      const stt = new SherpaOnnxStt({ createRecognizer: () => mockRecognizer });
      const onError = vi.fn();
      const onEnd = vi.fn();
      stt.onError = onError;
      stt.onEnd = onEnd;

      await stt.initialize();
      stt.start();

      vi.advanceTimersByTime(100);
      expect(onError).toHaveBeenCalledWith('Speech processing error: decode crash');
      expect(stt.isListening).toBe(false);
    });

    it('shares in-flight initialize() promise across concurrent calls', async () => {
      const createRecognizer = vi.fn(() => ({
        createStream: vi.fn(),
        isReady: vi.fn(),
        decode: vi.fn(),
        isEndpoint: vi.fn(),
        getResult: vi.fn(),
        reset: vi.fn(),
      }));
      const stt = new SherpaOnnxStt({ createRecognizer });
      const ensureSpy = vi.spyOn(stt, 'ensureModel');

      await Promise.all([stt.initialize(), stt.initialize()]);

      expect(ensureSpy).toHaveBeenCalledTimes(1);
      expect(createRecognizer).toHaveBeenCalledTimes(1);
    });
  });
});
