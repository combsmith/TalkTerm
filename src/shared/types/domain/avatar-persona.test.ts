import { describe, it, expect } from 'vitest';
import { MVP_PERSONAS } from './avatar-persona';

describe('MVP_PERSONAS', () => {
  it('contains at least one persona', () => {
    expect(MVP_PERSONAS.length).toBeGreaterThanOrEqual(1);
  });

  it('each persona has required fields', () => {
    for (const persona of MVP_PERSONAS) {
      expect(persona.id).toBeTruthy();
      expect(persona.name).toBeTruthy();
      expect(persona.description).toBeTruthy();
      expect(persona.riveAssetPath).toBeTruthy();
      expect(persona.ttsVoiceName).toBeTruthy();
    }
  });

  it('persona IDs are unique', () => {
    const ids = MVP_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
