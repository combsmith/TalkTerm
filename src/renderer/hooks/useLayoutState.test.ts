// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLayoutState } from './useLayoutState';

describe('useLayoutState', () => {
  it('starts in conversation mode', () => {
    const { result } = renderHook(() => useLayoutState());
    expect(result.current.mode).toBe('conversation');
    expect(result.current.leftPanelVisible).toBe(false);
    expect(result.current.rightPanelVisible).toBe(false);
  });

  it('shows decision point (left panel)', () => {
    const { result } = renderHook(() => useLayoutState());
    act(() => {
      result.current.showDecision();
    });
    expect(result.current.mode).toBe('decision-point');
    expect(result.current.leftPanelVisible).toBe(true);
    expect(result.current.rightPanelVisible).toBe(false);
  });

  it('shows output only (right panel)', () => {
    const { result } = renderHook(() => useLayoutState());
    act(() => {
      result.current.showOutput();
    });
    expect(result.current.mode).toBe('output-only');
    expect(result.current.rightPanelVisible).toBe(true);
    expect(result.current.leftPanelVisible).toBe(false);
  });

  it('shows both panels (output review)', () => {
    const { result } = renderHook(() => useLayoutState());
    act(() => {
      result.current.showBoth();
    });
    expect(result.current.mode).toBe('output-review');
    expect(result.current.leftPanelVisible).toBe(true);
    expect(result.current.rightPanelVisible).toBe(true);
  });

  it('resets to conversation', () => {
    const { result } = renderHook(() => useLayoutState());
    act(() => {
      result.current.showBoth();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.mode).toBe('conversation');
  });
});
