import { describe, it, expect } from 'vitest';
import { determineFirstIncompleteStep, type LaunchState } from './launch-state';

describe('determineFirstIncompleteStep', () => {
  it('returns needs-key when API key is invalid', () => {
    const state: LaunchState = {
      apiKeyValid: false,
      profileComplete: true,
      avatarSelected: true,
      workspaceSelected: true,
    };
    expect(determineFirstIncompleteStep(state)).toBe('needs-key');
  });

  it('returns needs-profile when profile is incomplete', () => {
    const state: LaunchState = {
      apiKeyValid: true,
      profileComplete: false,
      avatarSelected: true,
      workspaceSelected: true,
    };
    expect(determineFirstIncompleteStep(state)).toBe('needs-profile');
  });

  it('returns needs-avatar when avatar not selected', () => {
    const state: LaunchState = {
      apiKeyValid: true,
      profileComplete: true,
      avatarSelected: false,
      workspaceSelected: true,
    };
    expect(determineFirstIncompleteStep(state)).toBe('needs-avatar');
  });

  it('returns needs-workspace when workspace not selected', () => {
    const state: LaunchState = {
      apiKeyValid: true,
      profileComplete: true,
      avatarSelected: true,
      workspaceSelected: false,
    };
    expect(determineFirstIncompleteStep(state)).toBe('needs-workspace');
  });

  it('returns ready when all steps are complete', () => {
    const state: LaunchState = {
      apiKeyValid: true,
      profileComplete: true,
      avatarSelected: true,
      workspaceSelected: true,
    };
    expect(determineFirstIncompleteStep(state)).toBe('ready');
  });

  it('returns first incomplete step by priority (key > profile > workspace > avatar)', () => {
    const state: LaunchState = {
      apiKeyValid: false,
      profileComplete: false,
      avatarSelected: false,
      workspaceSelected: false,
    };
    expect(determineFirstIncompleteStep(state)).toBe('needs-key');

    const postProfileState: LaunchState = {
      apiKeyValid: true,
      profileComplete: true,
      avatarSelected: false,
      workspaceSelected: false,
    };
    expect(determineFirstIncompleteStep(postProfileState)).toBe('needs-workspace');
  });
});
