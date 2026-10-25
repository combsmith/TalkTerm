import { useRef, type ReactElement } from 'react';
import type { AvatarAnimationState } from '../../hooks/useAvatarState';

interface AvatarCanvasProps {
  state: AvatarAnimationState;
  riveAssetPath?: string;
}

/**
 * AvatarCanvas renders the animated avatar character.
 *
 * When a .riv asset path is provided, it renders a canvas element ready for
 * Rive runtime binding; otherwise it renders a CSS-animated placeholder avatar.
 */
export function AvatarCanvas({ state, riveAssetPath }: AvatarCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Placeholder avatar — will be replaced by Rive canvas
  const stateColors: Record<AvatarAnimationState, string> = {
    ready: 'bg-primary/20',
    listening: 'bg-primary/60',
    thinking: 'bg-primary/40',
    'deep-thinking': 'bg-indigo-500/40',
    speaking: 'bg-primary-light/60',
    error: 'bg-danger/40',
  };

  const stateAnimations: Record<AvatarAnimationState, string> = {
    ready: '',
    listening: 'animate-pulse',
    thinking: 'animate-bounce',
    'deep-thinking': 'animate-pulse',
    speaking: 'animate-pulse',
    error: '',
  };

  if (riveAssetPath !== undefined) {
    return (
      <canvas
        ref={canvasRef}
        data-testid="avatar-canvas"
        className="h-[300px] w-[300px]"
        aria-label={`Avatar is ${state}`}
      />
    );
  }

  return (
    <div
      data-testid="avatar-placeholder"
      aria-label={`Avatar is ${state}`}
      className={`flex h-[250px] w-[250px] items-center justify-center rounded-full shadow-[0_0_40px_rgba(99,102,241,0.3)] ring-2 ring-primary/30 ${stateColors[state]} ${stateAnimations[state]} transition-all duration-300`}
    >
      <span className="text-[80px]">
        {state === 'ready'
          ? '😊'
          : state === 'listening'
            ? '👂'
            : state === 'thinking'
              ? '🤔'
              : state === 'deep-thinking'
                ? '🧠'
                : '🗣️'}
      </span>
    </div>
  );
}
