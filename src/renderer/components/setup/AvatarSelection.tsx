import type { ReactElement } from 'react';
import { MVP_PERSONAS } from '../../../shared/types/domain/avatar-persona';

interface AvatarSelectionProps {
  onSelect: (personaId: string) => void;
}

export function AvatarSelection({ onSelect }: AvatarSelectionProps): ReactElement {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-stage-bg">
      <div className="flex w-full max-w-lg flex-col gap-8 rounded-2xl bg-surface-muted/80 p-10">
        <h1 className="text-center text-display text-text-on-dark">Choose your team member</h1>
        <p className="text-center text-body text-text-muted-on-dark">
          More team members are on the way — for now, meet your first AI colleague.
        </p>
        <div className="flex flex-col gap-4">
          {MVP_PERSONAS.map((persona) => (
            <button
              key={persona.id}
              type="button"
              onClick={() => {
                onSelect(persona.id);
              }}
              aria-label={`Select ${persona.name}`}
              className="flex flex-col gap-2 rounded-xl border-2 border-text-muted-on-dark p-6 text-left transition-all hover:border-primary hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="text-title text-text-on-dark">{persona.name}</span>
              <span className="text-small text-text-muted-on-dark">{persona.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
