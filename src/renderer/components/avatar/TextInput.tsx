import { useState, useRef, useCallback, type ReactElement, type KeyboardEvent } from 'react';

interface TextInputProps {
  avatarName: string;
  onSend: (text: string) => void;
  onMicClick: () => void;
  isListening: boolean;
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function TextInput({
  avatarName,
  onSend,
  onMicClick,
  isListening,
  disabled,
  value,
  onValueChange,
}: TextInputProps): ReactElement {
  const [internalText, setInternalText] = useState('');
  const isControlled = value !== undefined;
  const text = isControlled ? value : internalText;
  const setText = isControlled ? (onValueChange ?? setInternalText) : setInternalText;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback((): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current !== null) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend, setText]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((): void => {
    if (textareaRef.current !== null) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 4 * 24; // 4 lines * ~24px line height
      textareaRef.current.style.height = `${String(Math.min(textareaRef.current.scrollHeight, maxHeight))}px`;
    }
  }, []);

  return (
    <div className="flex items-end gap-2 px-4 pb-4">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={`Type, paste, or speak to ${avatarName}...`}
        disabled={disabled === true}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-text-muted-on-dark bg-stage-bg px-4 py-3 text-body text-text-on-dark outline-none transition-colors focus:border-primary disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onMicClick}
        aria-label={isListening ? 'Stop recording' : 'Start recording'}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
          isListening
            ? 'bg-danger ring-2 ring-danger/50 animate-pulse'
            : 'bg-primary hover:bg-primary-dark'
        }`}
      >
        <span className="text-xl text-white">{isListening ? '⏹' : '🎤'}</span>
      </button>
    </div>
  );
}
