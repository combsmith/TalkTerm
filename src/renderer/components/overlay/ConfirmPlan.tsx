import type { ReactElement } from 'react';
import type { ActionCardData } from './ActionCard';
import { ActionPanel } from './ActionPanel';

interface ConfirmPlanProps {
  actionDescription: string;
  onApprove: () => void;
  onModify: () => void;
  onCancel: () => void;
}

const CONFIRM_CARDS: ActionCardData[] = [
  { label: 'A', title: 'Approve', description: 'Go ahead with this action' },
  { label: 'B', title: 'Modify', description: 'I want to change something first' },
  { label: 'C', title: 'Cancel', description: "Don't do this" },
];

export function ConfirmPlan({
  actionDescription,
  onApprove,
  onModify,
  onCancel,
}: ConfirmPlanProps): ReactElement {
  function handleSelect(label: string): void {
    if (label === 'A') onApprove();
    else if (label === 'B') onModify();
    else if (label === 'C') onCancel();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-surface-muted p-4">
        <p className="text-body text-text-on-dark">{actionDescription}</p>
      </div>
      <ActionPanel title="Confirm action" cards={CONFIRM_CARDS} onSelect={handleSelect} />
    </div>
  );
}
