import { useReducer, useCallback } from 'react';

export type LayoutMode = 'conversation' | 'decision-point' | 'output-review' | 'output-only';

interface LayoutState {
  mode: LayoutMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
}

type LayoutAction =
  | { type: 'layout:show-decision' }
  | { type: 'layout:show-output' }
  | { type: 'layout:show-both' }
  | { type: 'layout:reset' };

function layoutReducer(_state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'layout:show-decision':
      return { mode: 'decision-point', leftPanelVisible: true, rightPanelVisible: false };
    case 'layout:show-output':
      return { mode: 'output-only', leftPanelVisible: false, rightPanelVisible: true };
    case 'layout:show-both':
      return { mode: 'output-review', leftPanelVisible: true, rightPanelVisible: true };
    case 'layout:reset':
      return { mode: 'conversation', leftPanelVisible: false, rightPanelVisible: false };
    /* c8 ignore next 3 */
    default:
      const _exhaustive: never = action;
      return _exhaustive;
  }
}

const initialState: LayoutState = {
  mode: 'conversation',
  leftPanelVisible: false,
  rightPanelVisible: false,
};

export interface UseLayoutStateReturn {
  mode: LayoutMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  showDecision: () => void;
  showOutput: () => void;
  showBoth: () => void;
  reset: () => void;
}

export function useLayoutState(): UseLayoutStateReturn {
  const [state, dispatch] = useReducer(layoutReducer, initialState);
  return {
    ...state,
    showDecision: useCallback(() => {
      dispatch({ type: 'layout:show-decision' });
    }, []),
    showOutput: useCallback(() => {
      dispatch({ type: 'layout:show-output' });
    }, []),
    showBoth: useCallback(() => {
      dispatch({ type: 'layout:show-both' });
    }, []),
    reset: useCallback(() => {
      dispatch({ type: 'layout:reset' });
    }, []),
  };
}
