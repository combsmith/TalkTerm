// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ActionCard, type ActionCardData } from './ActionCard';

const mockCard: ActionCardData = { label: 'A', title: 'Option A', description: 'First option' };

describe('ActionCard', () => {
  it('renders label, title, and description', () => {
    render(<ActionCard card={mockCard} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('First option')).toBeInTheDocument();
  });

  it('has role=option with aria-label', () => {
    render(<ActionCard card={mockCard} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-label', 'A: Option A — First option');
  });

  it('calls onSelect with label when clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ActionCard card={mockCard} selected={false} onSelect={onSelect} />);
    await user.click(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('is disabled when card.disabled is true', () => {
    const disabledCard = { ...mockCard, disabled: true };
    render(<ActionCard card={disabledCard} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByRole('option')).toBeDisabled();
  });

  it('shows "Your usual" badge when preferred', () => {
    const preferredCard = { ...mockCard, preferred: true };
    render(<ActionCard card={preferredCard} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Your usual')).toBeInTheDocument();
  });

  it('sets aria-selected when selected', () => {
    render(<ActionCard card={mockCard} selected={true} onSelect={vi.fn()} />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });
});
