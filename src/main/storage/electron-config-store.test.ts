import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { ElectronConfigStore, InMemoryConfigStore } from './electron-config-store';

describe('InMemoryConfigStore', () => {
  it('stores and retrieves values', () => {
    const store = new InMemoryConfigStore();
    store.set('name', 'Root');
    expect(store.get('name')).toBe('Root');
  });

  it('returns undefined for missing keys', () => {
    const store = new InMemoryConfigStore();
    expect(store.get('missing')).toBeUndefined();
  });

  it('checks key existence', () => {
    const store = new InMemoryConfigStore();
    store.set('key', 'value');
    expect(store.has('key')).toBe(true);
    expect(store.has('other')).toBe(false);
  });

  it('deletes keys', () => {
    const store = new InMemoryConfigStore();
    store.set('key', 'value');
    store.delete('key');
    expect(store.has('key')).toBe(false);
  });

  it('stores complex objects', () => {
    const store = new InMemoryConfigStore();
    store.set('profile', { name: 'Root', avatar: 'mary' });
    expect(store.get('profile')).toEqual({ name: 'Root', avatar: 'mary' });
  });
});

describe('ElectronConfigStore', () => {
  const tempDirs: string[] = [];

  function makeTempFilePath(subDir = ''): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talkterm-config-test-'));
    tempDirs.push(dir);
    return path.join(dir, subDir, 'config.json');
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists and reloads values across instances', () => {
    const filePath = makeTempFilePath('nested');
    const store1 = new ElectronConfigStore(filePath);
    store1.set('authMode', 'claude-subscription');
    store1.set('userProfile', { name: 'Alice', avatarPersonaId: 'mary' });

    const store2 = new ElectronConfigStore(filePath);
    expect(store2.get('authMode')).toBe('claude-subscription');
    expect(store2.get('userProfile')).toEqual({ name: 'Alice', avatarPersonaId: 'mary' });
    expect(store2.has('authMode')).toBe(true);
    expect(store2.has('missing')).toBe(false);
  });

  it('deletes keys and persists deletion', () => {
    const filePath = makeTempFilePath();
    const store1 = new ElectronConfigStore(filePath);
    store1.set('workspacePath', '/tmp/ws');
    expect(store1.has('workspacePath')).toBe(true);
    store1.delete('workspacePath');
    expect(store1.has('workspacePath')).toBe(false);

    const store2 = new ElectronConfigStore(filePath);
    expect(store2.has('workspacePath')).toBe(false);
    expect(store2.get('workspacePath')).toBeUndefined();
  });

  it('recovers gracefully from corrupted or non-object JSON files', () => {
    const filePath = makeTempFilePath();
    fs.writeFileSync(filePath, '{invalid json', 'utf-8');
    const store1 = new ElectronConfigStore(filePath);
    expect(store1.get('any')).toBeUndefined();

    fs.writeFileSync(filePath, '["array-not-object"]', 'utf-8');
    const store2 = new ElectronConfigStore(filePath);
    expect(store2.get('0')).toBeUndefined();
  });
});
