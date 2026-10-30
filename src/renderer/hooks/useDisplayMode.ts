import { useState, useCallback } from 'react';

export type DisplayMode =
  | 'task-progress'
  | 'plan-preview'
  | 'document'
  | 'comparison-table'
  | 'clustered-cards'
  | 'activity-feed'
  | 'none';

export interface ContentPayload {
  type: DisplayMode;
  data: unknown;
}

export interface UseDisplayModeReturn {
  mode: DisplayMode;
  data: unknown;
  setContent: (payload: ContentPayload) => void;
  clear: () => void;
}

export function useDisplayMode(): UseDisplayModeReturn {
  const [mode, setMode] = useState<DisplayMode>('none');
  const [data, setData] = useState<unknown>(null);

  const setContent = useCallback((payload: ContentPayload): void => {
    setMode(payload.type);
    setData(payload.data);
  }, []);

  const clear = useCallback((): void => {
    setMode('none');
    setData(null);
  }, []);

  return { mode, data, setContent, clear };
}
