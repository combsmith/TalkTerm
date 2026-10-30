import { vi } from 'vitest';
import type { SafeStorageAPI } from '../../../src/main/security/safe-storage-key-manager';

export function createMockSafeStorage(available = true): SafeStorageAPI {
  return {
    isEncryptionAvailable: vi.fn().mockReturnValue(available),
    encryptString: vi.fn((text: string) => Buffer.from(`encrypted:${text}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('encrypted:', '')),
  };
}
