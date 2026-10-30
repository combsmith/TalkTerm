import { type ReactElement, useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { ActionCard, type ActionCardData } from './ActionCard';

interface ActionPanelProps {
  title: string;
  cards: ActionCardData[];
  onSelect: (label: string) => void;
  'aria-label'?: string;
}

export function ActionPanel({
  title,
  cards,
  onSelect,
  'aria-label': ariaLabel,
}: ActionPanelProps): ReactElement {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (label: string): void => {
      setSelectedLabel(label);
      onSelect(label);
    },
    [onSelect],
  );

  const enabledIndices = cards
    .map((card, i) => (card.disabled === true ? -1 : i))
    .filter((i) => i >= 0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (enabledIndices.length === 0) return;

      const currentEnabledPos = enabledIndices.indexOf(focusedIndex);
      let nextIndex: number | undefined;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextPos = currentEnabledPos < 0 ? 0 : (currentEnabledPos + 1) % enabledIndices.length;
        nextIndex = enabledIndices[nextPos];
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextPos =
          currentEnabledPos < 0
            ? enabledIndices.length - 1
            : (currentEnabledPos - 1 + enabledIndices.length) % enabledIndices.length;
        nextIndex = enabledIndices[nextPos];
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const card = cards[focusedIndex];
        if (card !== undefined && card.disabled !== true) {
          handleSelect(card.label);
        }
        return;
      }

      if (nextIndex !== undefined) {
        setFocusedIndex(nextIndex);
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
        buttons?.[nextIndex]?.focus();
      }
    },
    [cards, enabledIndices, focusedIndex, handleSelect],
  );

  return (
    <div className="flex h-full w-[240px] flex-col gap-3 overflow-y-auto bg-surface-muted p-4">
      <h2 className="text-subtitle text-text-on-dark">{title}</h2>
      <div
        ref={listRef}
        className="flex flex-col gap-3"
        role="listbox"
        aria-label={ariaLabel ?? title}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {cards.map((card, index) => (
          <ActionCard
            key={card.label}
            card={card}
            selected={selectedLabel === card.label}
            onSelect={handleSelect}
            tabIndex={index === focusedIndex ? 0 : -1}
          />
        ))}
      </div>
    </div>
  );
}
