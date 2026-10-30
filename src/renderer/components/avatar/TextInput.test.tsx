// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders with avatar name in placeholder', () => {
    render(
      <TextInput avatarName="Mary" onSend={vi.fn()} onMicClick={vi.fn()} isListening={false} />,
    );
    expect(screen.getByPlaceholderText(/speak to Mary/)).toBeInTheDocument();
  });

  it('sends text on Enter', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <TextInput avatarName="Mary" onSend={onSend} onMicClick={vi.fn()} isListening={false} />,
    );
    await user.type(screen.getByRole('textbox'), 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('does not send on Shift+Enter (inserts newline)', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <TextInput avatarName="Mary" onSend={onSend} onMicClick={vi.fn()} isListening={false} />,
    );
    await user.type(screen.getByRole('textbox'), 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(
      <TextInput avatarName="Mary" onSend={vi.fn()} onMicClick={vi.fn()} isListening={false} />,
    );
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'hello{Enter}');
    expect(textarea).toHaveValue('');
  });

  it('calls onMicClick when mic button clicked', async () => {
    const onMicClick = vi.fn();
    const user = userEvent.setup();
    render(
      <TextInput avatarName="Mary" onSend={vi.fn()} onMicClick={onMicClick} isListening={false} />,
    );
    await user.click(screen.getByRole('button', { name: /start recording/i }));
    expect(onMicClick).toHaveBeenCalledOnce();
  });

  it('shows stop recording label when listening', () => {
    render(
      <TextInput avatarName="Mary" onSend={vi.fn()} onMicClick={vi.fn()} isListening={true} />,
    );
    expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
  });

  it('does not send empty text', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(
      <TextInput avatarName="Mary" onSend={onSend} onMicClick={vi.fn()} isListening={false} />,
    );
    await user.type(screen.getByRole('textbox'), '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
