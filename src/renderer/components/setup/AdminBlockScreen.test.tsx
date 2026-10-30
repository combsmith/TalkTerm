// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AdminBlockScreen } from './AdminBlockScreen';

describe('AdminBlockScreen', () => {
  it('renders the title', () => {
    render(
      <AdminBlockScreen
        platform="darwin"
        instructions="sudo /Applications/TalkTerm.app/Contents/MacOS/TalkTerm"
        onRetry={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(screen.getByText('TalkTerm needs admin privileges')).toBeInTheDocument();
  });

  it('displays macOS instructions when platform is darwin', () => {
    render(
      <AdminBlockScreen
        platform="darwin"
        instructions="sudo /Applications/TalkTerm.app/Contents/MacOS/TalkTerm"
        onRetry={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(screen.getByText(/sudo/)).toBeInTheDocument();
    expect(screen.queryByText(/Run as administrator/)).not.toBeInTheDocument();
  });

  it('displays Windows instructions when platform is win32', () => {
    render(
      <AdminBlockScreen
        platform="win32"
        instructions="Right-click TalkTerm → Run as administrator"
        onRetry={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(screen.getByText(/Run as administrator/)).toBeInTheDocument();
  });

  it('calls onRetry when Retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <AdminBlockScreen
        platform="darwin"
        instructions="sudo ..."
        onRetry={onRetry}
        onQuit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('calls onQuit when Quit button is clicked', async () => {
    const onQuit = vi.fn();
    const user = userEvent.setup();

    render(
      <AdminBlockScreen
        platform="darwin"
        instructions="sudo ..."
        onRetry={vi.fn()}
        onQuit={onQuit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /quit/i }));
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('renders the warning icon', () => {
    render(
      <AdminBlockScreen
        platform="darwin"
        instructions="sudo ..."
        onRetry={vi.fn()}
        onQuit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
  });
});
