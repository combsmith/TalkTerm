import type { ReactElement } from 'react';
import type { RecoveryOption } from '../../../shared/types/domain/agent-error';
import type { ActionCardData } from './ActionCard';
import { ActionPanel } from './ActionPanel';

interface ErrorRecoveryProps {
  userMessage: string;
  recoveryOptions: RecoveryOption[];
  onSelect: (action: string) => void;
}

export function ErrorRecovery({
  userMessage,
  recoveryOptions,
  onSelect,
}: ErrorRecoveryProps): ReactElement {
  const cards: ActionCardData[] = recoveryOptions.map((opt, i) => ({
    label: String.fromCharCode(65 + i),
    title: opt.label,
    description: opt.description,
  }));

  function handleSelect(label: string): void {
    const index = label.charCodeAt(0) - 65;
    const option = recoveryOptions[index];
    if (option !== undefined) {
      onSelect(option.action);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface-muted p-4">
        <p className="text-body text-text-on-dark">{userMessage}</p>
      </div>
      <ActionPanel title="What would you like to do?" cards={cards} onSelect={handleSelect} />
    </div>
  );
}
