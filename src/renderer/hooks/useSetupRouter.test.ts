// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSetupRouter } from './useSetupRouter';

describe('useSetupRouter', () => {
  it('starts at the given initial step', () => {
    const { result } = renderHook(() => useSetupRouter('needs-profile'));
    expect(result.current.currentStep).toBe('needs-profile');
  });

  it('defaults to needs-key', () => {
    const { result } = renderHook(() => useSetupRouter());
    expect(result.current.currentStep).toBe('needs-key');
  });

  it('advances to next step on completeCurrentStep', () => {
    const { result } = renderHook(() => useSetupRouter('needs-key'));
    act(() => {
      result.current.completeCurrentStep();
    });
    expect(result.current.currentStep).toBe('needs-profile');
  });

  it('advances through full setup flow', () => {
    const { result } = renderHook(() => useSetupRouter('needs-key'));
    act(() => {
      result.current.completeCurrentStep();
    }); // → needs-profile
    act(() => {
      result.current.completeCurrentStep();
    }); // → needs-avatar
    act(() => {
      result.current.completeCurrentStep();
    }); // → needs-workspace
    act(() => {
      result.current.completeCurrentStep();
    }); // → ready
    expect(result.current.currentStep).toBe('ready');
  });

  it('stays at ready when completing from ready', () => {
    const { result } = renderHook(() => useSetupRouter('ready'));
    act(() => {
      result.current.completeCurrentStep();
    });
    expect(result.current.currentStep).toBe('ready');
  });

  it('can jump to any step via goToStep', () => {
    const { result } = renderHook(() => useSetupRouter('needs-key'));
    act(() => {
      result.current.goToStep('needs-workspace');
    });
    expect(result.current.currentStep).toBe('needs-workspace');
  });
});
