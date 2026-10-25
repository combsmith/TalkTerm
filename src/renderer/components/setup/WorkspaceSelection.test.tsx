// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceSelection } from './WorkspaceSelection';

describe('WorkspaceSelection', () => {
  it('renders heading', () => {
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/connect a project/i)).toBeInTheDocument();
  });

  it('has a path input field', () => {
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByPlaceholderText(/path\/to\/your\/project/i)).toBeInTheDocument();
  });

  it('auto-focuses path input on mount', () => {
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByPlaceholderText(/path\/to\/your\/project/i)).toHaveFocus();
  });

  it('Select Folder button is disabled when path is empty', () => {
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole('button', { name: /select folder/i })).toBeDisabled();
  });

  it('Select Folder button enables when path is entered', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/path\/to\/your\/project/i), '/home/user/project');
    expect(screen.getByRole('button', { name: /select folder/i })).toBeEnabled();
  });

  it('has a Skip button', () => {
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  it('calls onSkip when Skip is clicked', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={onSkip} />);
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('shows confirmation after submitting a path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WorkspaceSelection onSelectFolder={vi.fn()} onSkip={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText(/path\/to\/your\/project/i),
      '/home/user/my-project',
    );
    await user.click(screen.getByRole('button', { name: /select folder/i }));

    expect(screen.getByTestId('selected-folder')).toHaveTextContent('/home/user/my-project');
    vi.useRealTimers();
  });

  it('calls onSelectFolder with path after delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSelectFolder = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WorkspaceSelection onSelectFolder={onSelectFolder} onSkip={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText(/path\/to\/your\/project/i),
      '/home/user/my-project',
    );
    await user.click(screen.getByRole('button', { name: /select folder/i }));

    expect(onSelectFolder).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(onSelectFolder).toHaveBeenCalledOnce();
    expect(onSelectFolder).toHaveBeenCalledWith('/home/user/my-project');
    vi.useRealTimers();
  });

  it('submits path with Enter key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSelectFolder = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WorkspaceSelection onSelectFolder={onSelectFolder} onSkip={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/path\/to\/your\/project/i), '/my/project');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('selected-folder')).toHaveTextContent('/my/project');
    vi.advanceTimersByTime(1200);
    expect(onSelectFolder).toHaveBeenCalledWith('/my/project');
    vi.useRealTimers();
  });

  it('wires Browse button to window.electronAPI.browseWorkspace', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSelectFolder = vi.fn();
    const browseWorkspace = vi.fn().mockResolvedValueOnce('/picked/workspace');
    Object.defineProperty(window, 'electronAPI', {
      value: { browseWorkspace },
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<WorkspaceSelection onSelectFolder={onSelectFolder} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(browseWorkspace).toHaveBeenCalledOnce();
    expect(screen.getByTestId('selected-folder')).toHaveTextContent('/picked/workspace');

    vi.advanceTimersByTime(1200);
    expect(onSelectFolder).toHaveBeenCalledWith('/picked/workspace');
    vi.useRealTimers();
  });

  it('does not confirm when browseWorkspace returns null (user cancelled dialog)', async () => {
    const onSelectFolder = vi.fn();
    const browseWorkspace = vi.fn().mockResolvedValueOnce(null);
    Object.defineProperty(window, 'electronAPI', {
      value: { browseWorkspace },
      writable: true,
      configurable: true,
    });
    const user = userEvent.setup();
    render(<WorkspaceSelection onSelectFolder={onSelectFolder} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(browseWorkspace).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('selected-folder')).not.toBeInTheDocument();
    expect(onSelectFolder).not.toHaveBeenCalled();
  });
});
