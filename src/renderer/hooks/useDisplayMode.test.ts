// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDisplayMode } from './useDisplayMode';

describe('useDisplayMode', () => {
  it('starts with mode none', () => {
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe('none');
    expect(result.current.data).toBeNull();
  });

  it('sets content with type and data', () => {
    const { result } = renderHook(() => useDisplayMode());
    act(() => {
      result.current.setContent({ type: 'document', data: { markdown: '# Hello' } });
    });
    expect(result.current.mode).toBe('document');
    expect(result.current.data).toEqual({ markdown: '# Hello' });
  });

  it('clears mode back to none', () => {
    const { result } = renderHook(() => useDisplayMode());
    act(() => {
      result.current.setContent({ type: 'task-progress', data: {} });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.mode).toBe('none');
  });

  it('auto-selects mode from content type', () => {
    const { result } = renderHook(() => useDisplayMode());
    act(() => {
      result.current.setContent({ type: 'comparison-table', data: { rows: [] } });
    });
    expect(result.current.mode).toBe('comparison-table');
  });
});
