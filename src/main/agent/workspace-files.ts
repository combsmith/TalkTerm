import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

/** Largest context file loaded into the system prompt. BMAD agent files are a few KiB. */
export const CONTEXT_FILE_MAX_BYTES = 64 * 1024;

/** Read-only SDK tools decided against the workspace instead of being pre-approved. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep', 'LS']);

const GLOB_CHARS = /[*?[\]{}]/;

/** True when `target` is `root` itself or a descendant of it. Both must already be canonical. */
export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Resolve symlinks in `target`. A path that does not exist yet is resolved through its
 * nearest existing ancestor, so a missing file under a symlinked directory still lands
 * where the link points.
 */
export async function canonicalize(target: string): Promise<string> {
  const absolute = path.resolve(target);
  try {
    return await realpath(absolute);
  } catch (err) {
    const parent = path.dirname(absolute);
    if (!isMissing(err) || parent === absolute) {
      throw err;
    }
    return path.join(await canonicalize(parent), path.basename(absolute));
  }
}

/**
 * Could escape the directory it is applied to: contains `..` (also inside braces) or
 * starts with `~`, which the SDK expands to the home directory.
 */
function unbounded(value: string): boolean {
  return value === '' || value.includes('..') || value.startsWith('~');
}

/** Leading part of a glob pattern before its first wildcard segment. */
function staticPrefix(pattern: string): string {
  const segments = pattern.split(/[\\/]/);
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  return (firstGlob === -1 ? segments : segments.slice(0, firstGlob)).join(path.sep) || path.sep;
}

/**
 * Paths a read-only tool call would touch, or null when the call cannot be bounded
 * (missing or non-string path, `..`, or `~`).
 */
function readTargets(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): string[] | null {
  const pathArg = (key: string, required: boolean): string | null => {
    const value = input[key];
    if (value === undefined && !required) return cwd;
    return typeof value === 'string' && !unbounded(value) ? path.resolve(cwd, value) : null;
  };

  if (toolName === 'Read') {
    const filePath = pathArg('file_path', true);
    return filePath === null ? null : [filePath];
  }
  const base = pathArg('path', toolName === 'LS');
  if (base === null) return null;
  const pattern = input[toolName === 'Glob' ? 'pattern' : 'glob'];
  if (pattern === undefined) return [base];
  if (typeof pattern !== 'string' || unbounded(pattern)) return null;
  return path.isAbsolute(pattern) ? [base, staticPrefix(pattern)] : [base];
}

/**
 * Whether a read-only tool call stays inside the workspace once symlinks are resolved.
 * Anything that cannot be shown to stay inside returns false, so the caller asks the user.
 */
export async function isReadWithinWorkspace(
  toolName: string,
  input: Record<string, unknown>,
  workspacePath: string | undefined,
): Promise<boolean> {
  if (!READ_ONLY_TOOLS.has(toolName) || workspacePath === undefined) {
    return false;
  }
  try {
    const root = await realpath(workspacePath);
    const targets = readTargets(toolName, input, root);
    if (targets === null) return false;
    for (const target of targets) {
      if (!isWithin(root, await canonicalize(target))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a context file that must live inside `root`. Rejects when the path (after
 * resolving symlinks) leaves `root`, is not a regular file, or exceeds `maxBytes`.
 */
export async function readContextFile(
  filePath: string,
  root: string,
  maxBytes: number = CONTEXT_FILE_MAX_BYTES,
): Promise<string> {
  const canonicalRoot = await realpath(root);
  const canonicalFile = await realpath(filePath);
  if (!isWithin(canonicalRoot, canonicalFile)) {
    throw new Error(`Context file resolves outside ${root}`);
  }
  // O_NOFOLLOW refuses a symlink swapped in after realpath; O_NONBLOCK stops a FIFO from hanging.
  const handle = await open(
    canonicalFile,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error('Context file is not a regular file');
    }
    // Read at most one byte past the cap rather than trusting the size from stat.
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
      if (length > maxBytes) {
        throw new Error(`Context file exceeds ${String(maxBytes)} bytes`);
      }
    }
    return buffer.toString('utf-8', 0, length);
  } finally {
    await handle.close();
  }
}
