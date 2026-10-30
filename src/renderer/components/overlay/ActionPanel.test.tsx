// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { ActionCardData } from './ActionCard';
import { ActionPanel } from './ActionPanel';

const mockCards: ActionCardData[] = [
  { label: 'A', title: 'Option A', description: 'First' },
  { label: 'B', title: 'Option B', description: 'Second' },
  { label: 'C', title: 'Option C', description: 'Third' },
];

describe('ActionPanel', () => {
  it('renders title', () => {
    render(<ActionPanel title="Choose an approach" cards={mockCards} onSelect={vi.fn()} />);
    expect(screen.getByText('Choose an approach')).toBeInTheDocument();
  });

  it('renders all cards', () => {
    render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('calls onSelect when a card is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionPanel title="Choose" cards={mockCards} onSelect={onSelect} />);
    await user.click(screen.getByText('Option B'));
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('has 240px width', () => {
    const { container } = render(
      <ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />,
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.classList.contains('w-[240px]')).toBe(true);
  });

  it('uses the title as the listbox accessible name by default', () => {
    render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
    expect(screen.getByRole('listbox', { name: 'Choose' })).toBeInTheDocument();
  });

  it('uses aria-label prop when provided', () => {
    render(
      <ActionPanel
        title="Choose"
        cards={mockCards}
        onSelect={vi.fn()}
        aria-label="Pick an option"
      />,
    );
    expect(screen.getByRole('listbox', { name: 'Pick an option' })).toBeInTheDocument();
  });

  describe('keyboard navigation', () => {
    it('moves focus to the next enabled card on ArrowDown', async () => {
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getAllByRole('option')[1]).toHaveFocus();
    });

    it('moves focus to the previous enabled card on ArrowUp', async () => {
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{ArrowDown}'); // virtual index 0 → real focus on index 1
      await user.keyboard('{ArrowUp}'); // back to index 0
      expect(screen.getAllByRole('option')[0]).toHaveFocus();
    });

    it('wraps focus from last to first on ArrowDown', async () => {
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{ArrowDown}'); // 0 → 1
      await user.keyboard('{ArrowDown}'); // 1 → 2
      await user.keyboard('{ArrowDown}'); // 2 → 0 (wrap)
      expect(screen.getAllByRole('option')[0]).toHaveFocus();
    });

    it('wraps focus from first to last on ArrowUp', async () => {
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{ArrowUp}'); // 0 → 2 (wrap)
      expect(screen.getAllByRole('option')[2]).toHaveFocus();
    });

    it('selects the focused card on Enter', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={onSelect} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{Enter}');
      expect(onSelect).toHaveBeenCalledWith('A');
    });

    it('selects the focused card on Space', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={mockCards} onSelect={onSelect} />);
      screen.getByRole('listbox').focus();
      await user.keyboard(' ');
      expect(onSelect).toHaveBeenCalledWith('A');
    });

    it('skips disabled cards when navigating with ArrowDown', async () => {
      const cardsWithDisabled: ActionCardData[] = [
        { label: 'A', title: 'Option A', description: 'First', disabled: true },
        { label: 'B', title: 'Option B', description: 'Second' },
        { label: 'C', title: 'Option C', description: 'Third' },
      ];
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={cardsWithDisabled} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      await user.keyboard('{ArrowDown}');
      // card A is disabled → enabledIndices=[1,2], focusedIndex=0 not in list
      // ArrowDown with currentEnabledPos=-1 → pos 0 → index 1 (Option B)
      expect(screen.getAllByRole('option')[1]).toHaveFocus();
    });

    it('does not select a disabled card on Enter', async () => {
      const onSelect = vi.fn();
      const cardsWithDisabled: ActionCardData[] = [
        { label: 'A', title: 'Option A', description: 'First', disabled: true },
        { label: 'B', title: 'Option B', description: 'Second' },
      ];
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={cardsWithDisabled} onSelect={onSelect} />);
      screen.getByRole('listbox').focus();
      // focusedIndex=0 (disabled card A) — Enter should not fire onSelect
      await user.keyboard('{Enter}');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('skips disabled cards and wraps to last on ArrowUp when focused card is disabled', async () => {
      const cardsWithDisabled: ActionCardData[] = [
        { label: 'A', title: 'Option A', description: 'First', disabled: true },
        { label: 'B', title: 'Option B', description: 'Second' },
        { label: 'C', title: 'Option C', description: 'Third' },
      ];
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={cardsWithDisabled} onSelect={vi.fn()} />);
      screen.getByRole('listbox').focus();
      // focusedIndex=0 (disabled), enabledIndices=[1,2], currentEnabledPos=-1
      // ArrowUp with pos=-1 → nextPos = enabledIndices.length-1 = 1 → nextIndex = 2 (Option C)
      await user.keyboard('{ArrowUp}');
      expect(screen.getAllByRole('option')[2]).toHaveFocus();
    });

    it('does nothing when all cards are disabled', async () => {
      const onSelect = vi.fn();
      const allDisabled: ActionCardData[] = [
        { label: 'A', title: 'Option A', description: 'First', disabled: true },
      ];
      const user = userEvent.setup();
      render(<ActionPanel title="Choose" cards={allDisabled} onSelect={onSelect} />);
      screen.getByRole('listbox').focus();
      // Should not throw or move focus to disabled option
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowUp}');
      expect(screen.getAllByRole('option')[0]).not.toHaveFocus();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
