import { describe, it, expect } from 'vitest';
import { validateString } from './validate-string';

describe('validateString', () => {
  it('returns the string when valid', () => {
    const result = validateString('test-value', 'field');
    expect(result).toBe('test-value');
  });

  it('throws error when string is empty', () => {
    expect(() => validateString('', 'field')).toThrow('field must be a non-empty string');
  });

  it('throws error when value is not a string', () => {
    expect(() => validateString(123, 'field')).toThrow('field must be a non-empty string');
    expect(() => validateString(null, 'field')).toThrow('field must be a non-empty string');
    expect(() => validateString(undefined, 'field')).toThrow('field must be a non-empty string');
    expect(() => validateString({}, 'field')).toThrow('field must be a non-empty string');
  });

  it('includes field name in error message', () => {
    expect(() => validateString('', 'customFieldName')).toThrow(
      'customFieldName must be a non-empty string',
    );
  });
});
