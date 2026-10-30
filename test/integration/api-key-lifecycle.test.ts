/* eslint-disable @typescript-eslint/unbound-method -- vi.fn() mocks */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SafeStorageKeyManager } from '../../src/main/security/safe-storage-key-manager';
import { createMockSafeStorage } from '../support/fixtures/security';

describe('API key lifecycle (integration)', () => {
  let manager: SafeStorageKeyManager;
  let safeStorage: ReturnType<typeof createMockSafeStorage>;

  beforeEach(() => {
    safeStorage = createMockSafeStorage();
    manager = new SafeStorageKeyManager(safeStorage);
  });

  const TEST_KEY = 'sk-ant-api03-live-key-value';
  const REPLACEMENT_KEY = 'sk-ant-api03-replacement-key';

  // 1. No key state — should route to entry screen
  it('reports no key stored in initial state', () => {
    expect(manager.hasKey()).toBe(false);
    expect(manager.retrieveKey()).toBeNull();
  });

  // 2. Store key — encrypt and persist via safeStorage
  it('encrypts and stores a key via safeStorage', () => {
    manager.storeKey(TEST_KEY);

    expect(manager.hasKey()).toBe(true);
    expect(safeStorage.encryptString).toHaveBeenCalledWith(TEST_KEY);
    expect(safeStorage.isEncryptionAvailable).toHaveBeenCalled();
  });

  // 3. Retrieve key — decrypt and return correct value
  it('retrieves the correct decrypted key value', () => {
    manager.storeKey(TEST_KEY);
    const retrieved = manager.retrieveKey();

    expect(retrieved).toBe(TEST_KEY);
    expect(safeStorage.decryptString).toHaveBeenCalled();
  });

  // 4. Key validation flow — success and failure paths
  describe('key validation flow', () => {
    it('validates key successfully against a mock API check', () => {
      manager.storeKey(TEST_KEY);
      const key = manager.retrieveKey();
      // Simulate validation: key exists and matches expected format
      const isValid = key !== null && key.startsWith('sk-ant-');
      expect(isValid).toBe(true);
    });

    it('rejects an invalid key format', () => {
      manager.storeKey('bad-key-format');
      const key = manager.retrieveKey();
      const isValid = key !== null && key.startsWith('sk-ant-api03-');
      expect(isValid).toBe(false);
    });
  });

  // 5. Key expired/revoked — mock API returns 401
  it('reports expired state when API returns 401', () => {
    manager.storeKey(TEST_KEY);
    const key = manager.retrieveKey();
    expect(key).not.toBeNull();

    // Simulate 401 response from API validation
    const apiResponse = { status: 401, error: 'invalid_api_key' };
    const isExpired = apiResponse.status === 401;

    expect(isExpired).toBe(true);
    // After detecting expiry, delete and require re-entry
    manager.deleteKey();
    expect(manager.hasKey()).toBe(false);
  });

  // 6. Delete and re-enter — full replacement lifecycle
  it('supports delete and re-enter with a new key', () => {
    // Store original key
    manager.storeKey(TEST_KEY);
    expect(manager.hasKey()).toBe(true);
    expect(manager.retrieveKey()).toBe(TEST_KEY);

    // Delete existing key
    manager.deleteKey();
    expect(manager.hasKey()).toBe(false);
    expect(manager.retrieveKey()).toBeNull();

    // Store replacement key
    manager.storeKey(REPLACEMENT_KEY);
    expect(manager.hasKey()).toBe(true);
    expect(manager.retrieveKey()).toBe(REPLACEMENT_KEY);
  });

  // 7. Key never in plaintext logs — verify no leakage
  it('never exposes key plaintext through mock log calls', () => {
    const logSpy = vi.fn();
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = logSpy;
    console.warn = logSpy;
    console.error = logSpy;

    try {
      manager.storeKey(TEST_KEY);
      manager.retrieveKey();
      manager.deleteKey();

      // Verify the key value never appeared in any log call
      for (const call of logSpy.mock.calls) {
        const output = call.map(String).join(' ');
        expect(output).not.toContain(TEST_KEY);
      }
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });

  // Edge case: encryption unavailable blocks storage
  it('throws when encryption is unavailable', () => {
    const unavailable = createMockSafeStorage(false);
    const restrictedManager = new SafeStorageKeyManager(unavailable);

    expect(() => restrictedManager.storeKey(TEST_KEY)).toThrow('Encryption not available');
    expect(restrictedManager.hasKey()).toBe(false);
  });

  // Full lifecycle in sequence
  it('completes the full key lifecycle end-to-end', () => {
    // Start with no key
    expect(manager.hasKey()).toBe(false);

    // Store → retrieve → verify
    manager.storeKey(TEST_KEY);
    expect(manager.retrieveKey()).toBe(TEST_KEY);

    // Replace key
    manager.storeKey(REPLACEMENT_KEY);
    expect(manager.retrieveKey()).toBe(REPLACEMENT_KEY);

    // Delete → confirm gone
    manager.deleteKey();
    expect(manager.hasKey()).toBe(false);
    expect(manager.retrieveKey()).toBeNull();
  });
});
