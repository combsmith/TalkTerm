import type { ReactElement } from 'react';

export interface ActionCardData {
  label: string;
  title: string;
  description: string;
  disabled?: boolean;
  preferred?: boolean;
}

interface ActionCardProps {
  card: ActionCardData;
  selected: boolean;
  onSelect: (label: string) => void;
  tabIndex?: number;
}

export function ActionCard({ card, selected, onSelect, tabIndex }: ActionCardProps): ReactElement {
  const isDisabled = card.disabled === true;
  return (
    <button
      type="button"
      role="option"
      aria-label={`${card.label}: ${card.title} — ${card.description}`}
      aria-selected={selected}
      disabled={isDisabled}
      tabIndex={tabIndex}
      onClick={() => {
        onSelect(card.label);
      }}
      className={`relative flex w-full flex-col gap-1 rounded-xl border-2 p-4 text-left transition-all ${
        isDisabled
          ? 'cursor-not-allowed opacity-50'
          : selected
            ? 'border-primary shadow-[0_0_12px_rgba(235,140,0,0.3)]'
            : 'border-[#E0E0E0] hover:-translate-y-0.5 hover:border-primary hover:shadow-md'
      }`}
    >
      {card.preferred === true && (
        <span className="absolute -top-2 right-2 rounded-full bg-primary-light px-2 py-0.5 text-caption font-medium text-text-primary">
          Your usual
        </span>
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-caption font-bold text-white">
          {card.label}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-text-on-dark">{card.title}</span>
          <span className="text-small text-text-secondary">{card.description}</span>
        </div>
      </div>
    </button>
  );
}
