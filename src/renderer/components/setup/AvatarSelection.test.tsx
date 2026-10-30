// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AvatarSelection } from './AvatarSelection';

describe('AvatarSelection', () => {
  it('renders heading', () => {
    render(<AvatarSelection onSelect={vi.fn()} />);
    expect(screen.getByText(/choose your team member/i)).toBeInTheDocument();
  });

  it('displays at least one avatar option', () => {
    render(<AvatarSelection onSelect={vi.fn()} />);
    expect(screen.getByText('Mary')).toBeInTheDocument();
  });

  it('calls onSelect with persona id when selected', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<AvatarSelection onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /select mary/i }));
    expect(onSelect).toHaveBeenCalledWith('mary');
  });
});
