import { describe, it, expect } from 'vitest';
import { getDefaultWritebackType } from './writeback';

describe('getDefaultWritebackType', () => {
  it('defaults to ado-work-item for ADO origin', () => {
    expect(getDefaultWritebackType('ado-work-item')).toBe('ado-work-item');
  });

  it('defaults to pull-request for git repo origin', () => {
    expect(getDefaultWritebackType('git-repo')).toBe('pull-request');
  });

  it('defaults to local-file for local files origin', () => {
    expect(getDefaultWritebackType('local-files')).toBe('local-file');
  });
});
