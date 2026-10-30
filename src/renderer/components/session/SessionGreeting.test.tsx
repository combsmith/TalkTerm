// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SessionGreeting } from './SessionGreeting';

describe('SessionGreeting', () => {
  it('shows avatar on the greeting screen', () => {
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={[]}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
  });

  it('shows avatar on the welcome back screen', () => {
    const sessions = [{ id: 's1', workspacePath: '/project', updatedAt: '2026-03-24' }];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
  });

  it('shows friendly greeting with no sessions', () => {
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={[]}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText('Hey Root!')).toBeInTheDocument();
    expect(screen.getByText('What are you working on today?')).toBeInTheDocument();
  });

  it('auto-advances to conversation when no incomplete sessions', async () => {
    const onStartNew = vi.fn();
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={[]}
        onResume={vi.fn()}
        onStartNew={onStartNew}
      />,
    );
    await waitFor(
      () => {
        expect(onStartNew).toHaveBeenCalledOnce();
      },
      { timeout: 3000 },
    );
  });

  it('shows resume option with one session', () => {
    const sessions = [{ id: 's1', workspacePath: '/project', updatedAt: '2026-03-24' }];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText('Welcome back, Root!')).toBeInTheDocument();
    expect(screen.getByText(/pick up where you left off/)).toBeInTheDocument();
  });

  it('does not auto-advance when there are incomplete sessions', async () => {
    const onStartNew = vi.fn();
    const sessions = [{ id: 's1', workspacePath: '/project', updatedAt: '2026-03-24' }];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={vi.fn()}
        onStartNew={onStartNew}
      />,
    );
    // Wait a bit to ensure it doesn't fire
    await new Promise((r) => setTimeout(r, 100));
    expect(onStartNew).not.toHaveBeenCalled();
  });

  it('shows multiple sessions', () => {
    const sessions = [
      { id: 's1', workspacePath: '/project1', updatedAt: '2026-03-24' },
      { id: 's2', workspacePath: '/project2', updatedAt: '2026-03-23' },
    ];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={vi.fn()}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
  });

  it('calls onResume when session clicked', async () => {
    const onResume = vi.fn();
    const user = userEvent.setup();
    const sessions = [{ id: 's1', workspacePath: '/project', updatedAt: '2026-03-24' }];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={onResume}
        onStartNew={vi.fn()}
      />,
    );
    await user.click(screen.getByText('/project'));
    expect(onResume).toHaveBeenCalledWith('s1');
  });

  it('calls onStartNew when start new clicked', async () => {
    const onStartNew = vi.fn();
    const user = userEvent.setup();
    const sessions = [{ id: 's1', workspacePath: '/project', updatedAt: '2026-03-24' }];
    render(
      <SessionGreeting
        userName="Root"
        incompleteSessions={sessions}
        onResume={vi.fn()}
        onStartNew={onStartNew}
      />,
    );
    await user.click(screen.getByRole('button', { name: /start new/i }));
    expect(onStartNew).toHaveBeenCalledOnce();
  });
});
