import type { ReactElement } from 'react';

interface SuggestionChipsProps {
  suggestions: string[];
  selected: string[];
  onToggle: (chip: string) => void;
}

export function SuggestionChips({
  suggestions,
  selected,
  onToggle,
}: SuggestionChipsProps): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => {
        const isSelected = selected.includes(suggestion);
        return (
          <button
            key={suggestion}
            type="button"
            data-testid="suggestion-chip"
            aria-pressed={isSelected}
            onClick={() => {
              onToggle(suggestion);
            }}
            className={`rounded-full border px-3 py-1 text-small transition-colors ${
              isSelected
                ? 'border-primary bg-primary-light/20 text-text-on-dark'
                : 'border-[#E0E0E0] bg-surface-elevated text-text-primary hover:border-primary'
            }`}
          >
            {suggestion}
          </button>
        );
      })}
    </div>
  );
}
