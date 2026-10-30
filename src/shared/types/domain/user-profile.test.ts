import { describe, it, expect } from 'vitest';
import { createUserProfile } from './user-profile';

describe('createUserProfile', () => {
  it('creates a profile with name and null avatar', () => {
    const profile = createUserProfile('Root');
    expect(profile.name).toBe('Root');
    expect(profile.avatarPersonaId).toBeNull();
    expect(profile.createdAt).toBeInstanceOf(Date);
    expect(profile.updatedAt).toBeInstanceOf(Date);
  });

  it('trims whitespace from name', () => {
    const profile = createUserProfile('  Root  ');
    expect(profile.name).toBe('Root');
  });

  it('throws for empty name', () => {
    expect(() => createUserProfile('')).toThrow('User name cannot be empty');
  });

  it('throws for whitespace-only name', () => {
    expect(() => createUserProfile('   ')).toThrow('User name cannot be empty');
  });
});
