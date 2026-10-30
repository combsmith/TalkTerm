// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SuggestionChips } from './SuggestionChips';

describe('SuggestionChips', () => {
  it('renders all suggestions', () => {
    const suggestions = ['option-a', 'option-b', 'option-c'];
    render(<SuggestionChips suggestions={suggestions} selected={[]} onToggle={() => {}} />);

    suggestions.forEach((suggestion) => {
      expect(screen.getByText(suggestion)).toBeInTheDocument();
    });
  });

  it('toggles selection on click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const suggestions = ['choice-1', 'choice-2'];

    render(<SuggestionChips suggestions={suggestions} selected={[]} onToggle={onToggle} />);

    await user.click(screen.getByText('choice-1'));
    expect(onToggle).toHaveBeenCalledWith('choice-1');

    await user.click(screen.getByText('choice-2'));
    expect(onToggle).toHaveBeenCalledWith('choice-2');
  });

  it('marks selected chips with aria-pressed', () => {
    const suggestions = ['a', 'b'];
    render(<SuggestionChips suggestions={suggestions} selected={['a']} onToggle={() => {}} />);

    const chips = screen.getAllByTestId('suggestion-chip');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies selected styling to selected chips', () => {
    const suggestions = ['yes', 'no'];
    render(<SuggestionChips suggestions={suggestions} selected={['yes']} onToggle={() => {}} />);

    const yesButton = screen.getByText('yes');
    const noButton = screen.getByText('no');

    expect(yesButton).toHaveClass('border-primary', 'bg-primary-light/20');
    expect(noButton).toHaveClass('border-[#E0E0E0]', 'bg-surface-elevated');
  });

  it('renders empty when no suggestions provided', () => {
    render(<SuggestionChips suggestions={[]} selected={[]} onToggle={() => {}} />);

    const buttons = screen.queryAllByTestId('suggestion-chip');
    expect(buttons).toHaveLength(0);
  });
});
