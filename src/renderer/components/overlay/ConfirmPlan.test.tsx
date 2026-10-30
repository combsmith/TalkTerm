// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmPlan } from './ConfirmPlan';

describe('ConfirmPlan', () => {
  it('renders action description', () => {
    render(
      <ConfirmPlan
        actionDescription="Create file README.md"
        onApprove={vi.fn()}
        onModify={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Create file README.md')).toBeInTheDocument();
  });

  it('shows Approve, Modify, Cancel cards', () => {
    render(
      <ConfirmPlan
        actionDescription="test"
        onApprove={vi.fn()}
        onModify={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Modify')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onApprove when Approve selected', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmPlan
        actionDescription="test"
        onApprove={onApprove}
        onModify={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('calls onModify when Modify selected', async () => {
    const onModify = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmPlan
        actionDescription="test"
        onApprove={vi.fn()}
        onModify={onModify}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Modify'));
    expect(onModify).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel selected', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmPlan
        actionDescription="test"
        onApprove={vi.fn()}
        onModify={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
