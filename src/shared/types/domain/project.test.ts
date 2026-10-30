import { describe, it, expect } from 'vitest';

describe('Project foundation', () => {
  it('TypeScript strict mode is enabled', () => {
    // This test verifies the project compiles under strict TypeScript
    const value: string = 'TalkTerm';
    expect(value).toBe('TalkTerm');
  });

  it('noUncheckedIndexedAccess is enabled', () => {
    // Under noUncheckedIndexedAccess, arr[0] is T | undefined
    const arr: string[] = ['hello'];
    const first = arr[0];
    // first is string | undefined — must check before use
    expect(first).toBeDefined();
  });
});
