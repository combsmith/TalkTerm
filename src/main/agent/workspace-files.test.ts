import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalize,
  CONTEXT_FILE_MAX_BYTES,
  isReadWithinWorkspace,
  isWithin,
  readContextFile,
} from './workspace-files';

let root: string;
let workspace: string;
let outside: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'talkterm-ws-')));
  workspace = path.join(root, 'workspace');
  outside = path.join(root, 'outside');
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(workspace, 'docs', 'notes.md'), 'inside');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(workspace, 'escape.txt'));
  fs.symlinkSync(outside, path.join(workspace, 'escape-dir'));
  fs.symlinkSync(path.join(workspace, 'docs', 'notes.md'), path.join(workspace, 'alias.md'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('isWithin', () => {
  it('accepts the root itself and its descendants', () => {
    expect(isWithin('/ws', '/ws')).toBe(true);
    expect(isWithin('/ws', '/ws/a/b')).toBe(true);
  });

  it('rejects parents, siblings sharing a prefix, and other trees', () => {
    expect(isWithin('/ws', '/')).toBe(false);
    expect(isWithin('/ws', '/ws-other/file')).toBe(false);
    expect(isWithin('/ws', '/etc/passwd')).toBe(false);
  });

  it('accepts a descendant whose name starts with two dots', () => {
    expect(isWithin('/ws', '/ws/..hidden')).toBe(true);
    expect(isWithin('/ws', '/ws/a/..b')).toBe(true);
  });
});

describe('canonicalize', () => {
  it('resolves symlinks in an existing path', async () => {
    await expect(canonicalize(path.join(workspace, 'escape.txt'))).resolves.toBe(
      path.join(outside, 'secret.txt'),
    );
  });

  it('resolves a missing file through its nearest existing ancestor', async () => {
    await expect(canonicalize(path.join(workspace, 'escape-dir', 'new', 'file.txt'))).resolves.toBe(
      path.join(outside, 'new', 'file.txt'),
    );
  });

  it.runIf(process.platform !== 'win32')('rethrows errors other than a missing path', async () => {
    const loop = path.join(workspace, 'loop');
    fs.symlinkSync(loop, loop);
    await expect(canonicalize(loop)).rejects.toThrow();
  });
});

describe('isReadWithinWorkspace', () => {
  const inside = (): string => path.join(workspace, 'docs', 'notes.md');

  it('only decides read-only tools', async () => {
    await expect(isReadWithinWorkspace('Write', { file_path: inside() }, workspace)).resolves.toBe(
      false,
    );
    await expect(isReadWithinWorkspace('Bash', { command: 'ls' }, workspace)).resolves.toBe(false);
  });

  it('refuses when there is no usable workspace', async () => {
    await expect(isReadWithinWorkspace('Read', { file_path: inside() }, undefined)).resolves.toBe(
      false,
    );
    await expect(isReadWithinWorkspace('Read', { file_path: inside() }, '')).resolves.toBe(false);
    await expect(
      isReadWithinWorkspace('Read', { file_path: inside() }, path.join(root, 'missing')),
    ).resolves.toBe(false);
  });

  describe('Read', () => {
    it('allows absolute and relative paths inside the workspace', async () => {
      await expect(isReadWithinWorkspace('Read', { file_path: inside() }, workspace)).resolves.toBe(
        true,
      );
      await expect(
        isReadWithinWorkspace('Read', { file_path: 'docs/notes.md' }, workspace),
      ).resolves.toBe(true);
    });

    it('allows a symlink that stays inside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Read', { file_path: path.join(workspace, 'alias.md') }, workspace),
      ).resolves.toBe(true);
    });

    it('allows a file that does not exist yet inside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Read', { file_path: 'docs/later.md' }, workspace),
      ).resolves.toBe(true);
    });

    it('refuses paths outside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Read', { file_path: path.join(outside, 'secret.txt') }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Read', { file_path: '../outside/secret.txt' }, workspace),
      ).resolves.toBe(false);
    });

    it('refuses symlinks and symlinked directories that escape the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Read', { file_path: 'escape.txt' }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Read', { file_path: 'escape-dir/missing.txt' }, workspace),
      ).resolves.toBe(false);
    });

    it('refuses home-relative and malformed paths', async () => {
      await expect(
        isReadWithinWorkspace('Read', { file_path: '~/.ssh/id_rsa' }, workspace),
      ).resolves.toBe(false);
      await expect(isReadWithinWorkspace('Read', { file_path: '' }, workspace)).resolves.toBe(
        false,
      );
      await expect(isReadWithinWorkspace('Read', { file_path: 42 }, workspace)).resolves.toBe(
        false,
      );
      await expect(isReadWithinWorkspace('Read', {}, workspace)).resolves.toBe(false);
    });

    it('compares canonical paths when the workspace is given through a symlink', async () => {
      const linkedWorkspace = path.join(root, 'linked-workspace');
      fs.symlinkSync(workspace, linkedWorkspace);
      await expect(
        isReadWithinWorkspace(
          'Read',
          { file_path: path.join(linkedWorkspace, 'docs', 'notes.md') },
          linkedWorkspace,
        ),
      ).resolves.toBe(true);
      await expect(
        isReadWithinWorkspace(
          'Read',
          { file_path: path.join(linkedWorkspace, 'escape.txt') },
          linkedWorkspace,
        ),
      ).resolves.toBe(false);
    });
  });

  describe('LS', () => {
    it('requires a path inside the workspace', async () => {
      await expect(isReadWithinWorkspace('LS', { path: 'docs' }, workspace)).resolves.toBe(true);
      await expect(isReadWithinWorkspace('LS', { path: outside }, workspace)).resolves.toBe(false);
      await expect(isReadWithinWorkspace('LS', {}, workspace)).resolves.toBe(false);
    });
  });

  describe('Glob', () => {
    it('allows relative patterns with no path or a path inside the workspace', async () => {
      await expect(isReadWithinWorkspace('Glob', { pattern: '**/*.md' }, workspace)).resolves.toBe(
        true,
      );
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '*.md', path: 'docs' }, workspace),
      ).resolves.toBe(true);
    });

    it('allows an absolute pattern rooted inside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Glob', { pattern: `${workspace}/docs/*.md` }, workspace),
      ).resolves.toBe(true);
      await expect(
        isReadWithinWorkspace('Glob', { pattern: `${workspace}/docs/notes.md` }, workspace),
      ).resolves.toBe(true);
    });

    it('refuses patterns and paths that reach outside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Glob', { pattern: `${outside}/**` }, workspace),
      ).resolves.toBe(false);
      await expect(isReadWithinWorkspace('Glob', { pattern: '/**' }, workspace)).resolves.toBe(
        false,
      );
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '../outside/*' }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '{..,docs}/*' }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '*', path: outside }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '*', path: 'escape-dir' }, workspace),
      ).resolves.toBe(false);
    });

    it('refuses malformed inputs', async () => {
      await expect(isReadWithinWorkspace('Glob', { pattern: 7 }, workspace)).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Glob', { pattern: '*', path: 7 }, workspace),
      ).resolves.toBe(false);
      await expect(isReadWithinWorkspace('Glob', {}, workspace)).resolves.toBe(true);
    });
  });

  describe('Grep', () => {
    it('allows searches scoped to the workspace', async () => {
      await expect(isReadWithinWorkspace('Grep', { pattern: '..' }, workspace)).resolves.toBe(true);
      await expect(
        isReadWithinWorkspace('Grep', { pattern: 'x', path: 'docs', glob: '*.md' }, workspace),
      ).resolves.toBe(true);
    });

    it('refuses searches that reach outside the workspace', async () => {
      await expect(
        isReadWithinWorkspace('Grep', { pattern: 'x', path: outside }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Grep', { pattern: 'x', glob: '../**' }, workspace),
      ).resolves.toBe(false);
      await expect(
        isReadWithinWorkspace('Grep', { pattern: 'x', glob: `${outside}/*` }, workspace),
      ).resolves.toBe(false);
    });
  });
});

describe('readContextFile', () => {
  it('reads a regular file inside the root', async () => {
    await expect(
      readContextFile(path.join(workspace, 'docs', 'notes.md'), workspace),
    ).resolves.toBe('inside');
  });

  it('reads through a symlink that stays inside the root', async () => {
    await expect(readContextFile(path.join(workspace, 'alias.md'), workspace)).resolves.toBe(
      'inside',
    );
  });

  it('accepts a root given through a symlink', async () => {
    const linkedWorkspace = path.join(root, 'linked-workspace');
    fs.symlinkSync(workspace, linkedWorkspace);
    await expect(
      readContextFile(path.join(linkedWorkspace, 'docs', 'notes.md'), linkedWorkspace),
    ).resolves.toBe('inside');
  });

  it('rejects a symlink that escapes the root', async () => {
    await expect(readContextFile(path.join(workspace, 'escape.txt'), workspace)).rejects.toThrow(
      /outside/,
    );
    await expect(
      readContextFile(path.join(workspace, 'escape-dir', 'secret.txt'), workspace),
    ).rejects.toThrow(/outside/);
  });

  it('rejects a path outside the root', async () => {
    await expect(readContextFile(path.join(outside, 'secret.txt'), workspace)).rejects.toThrow(
      /outside/,
    );
  });

  it('rejects a directory', async () => {
    // Windows refuses to open a directory at all; elsewhere the regular-file check rejects it.
    await expect(readContextFile(path.join(workspace, 'docs'), workspace)).rejects.toThrow(
      process.platform === 'win32' ? undefined : /regular file/,
    );
  });

  it.runIf(process.platform !== 'win32')('rejects a FIFO without blocking', async () => {
    const fifo = path.join(workspace, 'pipe');
    execFileSync('mkfifo', [fifo]);
    await expect(readContextFile(fifo, workspace)).rejects.toThrow(/regular file/);
  });

  it('rejects a missing file or root', async () => {
    await expect(readContextFile(path.join(workspace, 'nope.md'), workspace)).rejects.toThrow();
    await expect(
      readContextFile(path.join(workspace, 'docs', 'notes.md'), path.join(root, 'missing')),
    ).rejects.toThrow();
  });

  it('enforces the byte cap', async () => {
    const file = path.join(workspace, 'big.md');
    fs.writeFileSync(file, 'a'.repeat(10));
    await expect(readContextFile(file, workspace, 10)).resolves.toBe('a'.repeat(10));
    await expect(readContextFile(file, workspace, 9)).rejects.toThrow(/exceeds 9 bytes/);
  });

  it('caps at 64 KiB by default', async () => {
    const file = path.join(workspace, 'huge.md');
    fs.writeFileSync(file, 'a'.repeat(CONTEXT_FILE_MAX_BYTES + 1));
    expect(CONTEXT_FILE_MAX_BYTES).toBe(64 * 1024);
    await expect(readContextFile(file, workspace)).rejects.toThrow(/exceeds/);
    fs.truncateSync(file, CONTEXT_FILE_MAX_BYTES);
    await expect(readContextFile(file, workspace)).resolves.toHaveLength(CONTEXT_FILE_MAX_BYTES);
  });
});
