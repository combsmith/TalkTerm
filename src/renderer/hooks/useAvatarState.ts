import { useReducer, useCallback } from 'react';

export type AvatarAnimationState =
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'deep-thinking'
  | 'speaking'
  | 'error';

interface AvatarState {
  animationState: AvatarAnimationState;
}

type AvatarAction =
  | { type: 'avatar:set-ready' }
  | { type: 'avatar:set-listening' }
  | { type: 'avatar:set-thinking' }
  | { type: 'avatar:set-deep-thinking' }
  | { type: 'avatar:set-speaking' }
  | { type: 'avatar:set-error' };

function avatarReducer(_state: AvatarState, action: AvatarAction): AvatarState {
  switch (action.type) {
    case 'avatar:set-ready':
      return { animationState: 'ready' };
    case 'avatar:set-listening':
      return { animationState: 'listening' };
    case 'avatar:set-thinking':
      return { animationState: 'thinking' };
    case 'avatar:set-deep-thinking':
      return { animationState: 'deep-thinking' };
    case 'avatar:set-speaking':
      return { animationState: 'speaking' };
    case 'avatar:set-error':
      return { animationState: 'error' };
    /* c8 ignore next 3 */
    default:
      const _exhaustive: never = action;
      return _exhaustive;
  }
}

export interface UseAvatarStateReturn {
  animationState: AvatarAnimationState;
  setReady: () => void;
  setListening: () => void;
  setThinking: () => void;
  setDeepThinking: () => void;
  setSpeaking: () => void;
  setError: () => void;
}

export function useAvatarState(): UseAvatarStateReturn {
  const [state, dispatch] = useReducer(avatarReducer, { animationState: 'ready' });

  return {
    animationState: state.animationState,
    setReady: useCallback(() => {
      dispatch({ type: 'avatar:set-ready' });
    }, []),
    setListening: useCallback(() => {
      dispatch({ type: 'avatar:set-listening' });
    }, []),
    setThinking: useCallback(() => {
      dispatch({ type: 'avatar:set-thinking' });
    }, []),
    setDeepThinking: useCallback(() => {
      dispatch({ type: 'avatar:set-deep-thinking' });
    }, []),
    setSpeaking: useCallback(() => {
      dispatch({ type: 'avatar:set-speaking' });
    }, []),
    setError: useCallback(() => {
      dispatch({ type: 'avatar:set-error' });
    }, []),
  };
}
