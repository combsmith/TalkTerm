// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ErrorRecovery } from './ErrorRecovery';

const options = [
  { label: 'Try again', action: 'retry', description: 'Retry the operation' },
  { label: 'Skip', action: 'skip', description: 'Skip this step' },
  { label: 'Go back', action: 'back', description: 'Return to previous step' },
];

describe('ErrorRecovery', () => {
  it('renders user-friendly error message', () => {
    render(
      <ErrorRecovery
        userMessage="Something went wrong, but we can work through it."
        recoveryOptions={options}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/went wrong/)).toBeInTheDocument();
  });

  it('renders recovery option cards', () => {
    render(<ErrorRecovery userMessage="Error" recoveryOptions={options} onSelect={vi.fn()} />);
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Skip')).toBeInTheDocument();
    expect(screen.getByText('Go back')).toBeInTheDocument();
  });

  it('calls onSelect with action when card clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ErrorRecovery userMessage="Error" recoveryOptions={options} onSelect={onSelect} />);
    await user.click(screen.getByText('Try again'));
    expect(onSelect).toHaveBeenCalledWith('retry');
  });
});
