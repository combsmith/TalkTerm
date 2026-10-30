import type { ReactElement } from 'react';
import type { AvatarAnimationState } from '../../hooks/useAvatarState';

interface StatusIndicatorProps {
  state: AvatarAnimationState;
  contextText?: string;
}

export function StatusIndicator({ state, contextText }: StatusIndicatorProps): ReactElement | null {
  if (state === 'ready') return null;

  const config = {
    listening: { dotClass: 'bg-primary animate-pulse-dot', label: 'Listening...' },
    thinking: { dotClass: 'bg-primary/60 animate-pulse-dot', label: contextText ?? 'Thinking...' },
    'deep-thinking': { dotClass: 'bg-indigo-500/60 animate-pulse-dot', label: 'Deep thinking...' },
    speaking: { dotClass: 'bg-primary-light', label: 'Speaking' },
    error: { dotClass: 'bg-danger', label: 'Connection issue' },
  } as const;

  const { dotClass, label } = config[state];

  return (
    <div
      className="flex items-center gap-2 rounded-full bg-surface-muted/80 px-3 py-1"
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-caption text-text-muted-on-dark">{label}</span>
    </div>
  );
}
