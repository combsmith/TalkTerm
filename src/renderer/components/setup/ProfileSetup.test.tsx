// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProfileSetup } from './ProfileSetup';

describe('ProfileSetup', () => {
  it('renders prompt text', () => {
    render(<ProfileSetup onComplete={vi.fn()} />);
    expect(screen.getByText(/what should i call you/i)).toBeInTheDocument();
  });

  it('has a name input field', () => {
    render(<ProfileSetup onComplete={vi.fn()} />);
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it('auto-focuses the name input on mount', () => {
    render(<ProfileSetup onComplete={vi.fn()} />);
    expect(screen.getByPlaceholderText(/your name/i)).toHaveFocus();
  });

  it('Continue button disabled when name is empty', () => {
    render(<ProfileSetup onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('Continue button enabled when name is entered', async () => {
    const user = userEvent.setup();
    render(<ProfileSetup onComplete={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/your name/i), 'Root');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('calls onComplete with name when Continue is clicked', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ProfileSetup onComplete={onComplete} />);
    await user.type(screen.getByPlaceholderText(/your name/i), 'Root');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledWith('Root');
  });

  it('calls onComplete with name on Enter key', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ProfileSetup onComplete={onComplete} />);
    await user.type(screen.getByPlaceholderText(/your name/i), 'DJ{Enter}');
    expect(onComplete).toHaveBeenCalledWith('DJ');
  });

  it('does not call onComplete on Enter when name is empty', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<ProfileSetup onComplete={onComplete} />);
    await user.keyboard('{Enter}');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
