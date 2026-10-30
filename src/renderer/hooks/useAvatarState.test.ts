// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAvatarState } from './useAvatarState';

describe('useAvatarState', () => {
  it('starts in ready state', () => {
    const { result } = renderHook(() => useAvatarState());
    expect(result.current.animationState).toBe('ready');
  });

  it('transitions to listening', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setListening();
    });
    expect(result.current.animationState).toBe('listening');
  });

  it('transitions to thinking', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setThinking();
    });
    expect(result.current.animationState).toBe('thinking');
  });

  it('transitions to speaking', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setSpeaking();
    });
    expect(result.current.animationState).toBe('speaking');
  });

  it('transitions to deep-thinking', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setDeepThinking();
    });
    expect(result.current.animationState).toBe('deep-thinking');
  });

  it('transitions to error', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setError();
    });
    expect(result.current.animationState).toBe('error');
  });

  it('transitions back to ready', () => {
    const { result } = renderHook(() => useAvatarState());
    act(() => {
      result.current.setSpeaking();
    });
    act(() => {
      result.current.setReady();
    });
    expect(result.current.animationState).toBe('ready');
  });
});
