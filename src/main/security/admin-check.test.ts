import { execFileSync, execSync } from 'node:child_process';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAdminPrivileges, type AdminCheckResult } from './admin-check';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);
const mockExecFileSync = vi.mocked(execFileSync);

describe('checkAdminPrivileges', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('on macOS', () => {
    it('returns isAdmin true when process.getuid returns 0 (root)', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'darwin',
        getuid: () => 0,
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(true);
      expect(result.platform).toBe('darwin');
    });

    it('returns isAdmin true when user is in admin group (non-root)', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'darwin',
        getuid: () => 501,
      });
      mockExecSync.mockReturnValue('staff everyone localaccounts admin');

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(true);
      expect(result.platform).toBe('darwin');
      expect(result.instructions).toBeUndefined();
    });

    it('returns isAdmin false when not root and not in admin group', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'darwin',
        getuid: () => 501,
      });
      mockExecSync.mockReturnValue('staff everyone localaccounts');

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('darwin');
      expect(result.instructions).toContain('sudo');
    });

    it('returns isAdmin false when groups command fails', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'darwin',
        getuid: () => 501,
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('darwin');
      expect(result.instructions).toContain('sudo');
    });
  });

  describe('on Windows', () => {
    it('returns isAdmin true when elevated check succeeds via options', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        getuid: undefined,
      });

      const result: AdminCheckResult = checkAdminPrivileges({ isElevated: true });
      expect(result.isAdmin).toBe(true);
      expect(result.platform).toBe('win32');
    });

    it('returns isAdmin false when not elevated via options', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        getuid: undefined,
      });

      const result: AdminCheckResult = checkAdminPrivileges({ isElevated: false });
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('win32');
      expect(result.instructions).toContain('Run as administrator');
    });

    it('detects elevation via net.exe session when no options are passed', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        getuid: undefined,
      });
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(true);
      expect(result.platform).toBe('win32');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\net.exe',
        ['session'],
        expect.objectContaining({ timeout: 3000 }),
      );
    });

    it('returns isAdmin false when net.exe session fails on Windows', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'win32',
        getuid: undefined,
      });
      mockExecFileSync.mockImplementation(() => {
        throw new Error('Access is denied.');
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('win32');
      expect(result.instructions).toContain('Run as administrator');
    });
  });

  describe('on Linux', () => {
    it('returns isAdmin true when process.getuid returns 0', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'linux',
        getuid: () => 0,
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(true);
      expect(result.platform).toBe('linux');
    });

    it('returns isAdmin false when process.getuid returns non-zero', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'linux',
        getuid: () => 1000,
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('linux');
      expect(result.instructions).toContain('sudo');
    });
  });

  describe('on non-standard Unix platforms', () => {
    it('returns isAdmin false and falls back to Linux instructions when getuid is unavailable', () => {
      vi.stubGlobal('process', {
        ...process,
        platform: 'freebsd',
        getuid: undefined,
      });

      const result: AdminCheckResult = checkAdminPrivileges();
      expect(result.isAdmin).toBe(false);
      expect(result.platform).toBe('freebsd');
      expect(result.instructions).toContain('sudo');
    });
  });

  it('returns platform-specific instructions only for the current platform', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      getuid: () => 501,
    });
    mockExecSync.mockReturnValue('staff everyone localaccounts');

    const result: AdminCheckResult = checkAdminPrivileges();
    expect(result.instructions).toContain('sudo');
    expect(result.instructions).not.toContain('Run as administrator');
  });
});
