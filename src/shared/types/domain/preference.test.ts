import { describe, it, expect } from 'vitest';
import {
  shouldEstablishPreference,
  shouldShiftPreference,
  PREFERENCE_THRESHOLD_ESTABLISH,
  PREFERENCE_THRESHOLD_SHIFT,
} from './preference';

describe('Preference thresholds', () => {
  it('establishes preference after 3 consistent choices', () => {
    expect(shouldEstablishPreference(2)).toBe(false);
    expect(shouldEstablishPreference(3)).toBe(true);
    expect(shouldEstablishPreference(4)).toBe(true);
  });

  it('shifts preference after 2 consecutive different choices', () => {
    expect(shouldShiftPreference(1)).toBe(false);
    expect(shouldShiftPreference(2)).toBe(true);
    expect(shouldShiftPreference(3)).toBe(true);
  });

  it('has correct threshold constants', () => {
    expect(PREFERENCE_THRESHOLD_ESTABLISH).toBe(3);
    expect(PREFERENCE_THRESHOLD_SHIFT).toBe(2);
  });
});
