// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AvatarCanvas } from './AvatarCanvas';

describe('AvatarCanvas', () => {
  it('renders placeholder when no riveAssetPath', () => {
    render(<AvatarCanvas state="ready" />);
    expect(screen.getByTestId('avatar-placeholder')).toBeInTheDocument();
  });

  it('shows correct aria-label for each state', () => {
    const { rerender } = render(<AvatarCanvas state="ready" />);
    expect(screen.getByLabelText('Avatar is ready')).toBeInTheDocument();

    rerender(<AvatarCanvas state="listening" />);
    expect(screen.getByLabelText('Avatar is listening')).toBeInTheDocument();

    rerender(<AvatarCanvas state="thinking" />);
    expect(screen.getByLabelText('Avatar is thinking')).toBeInTheDocument();

    rerender(<AvatarCanvas state="speaking" />);
    expect(screen.getByLabelText('Avatar is speaking')).toBeInTheDocument();
  });

  it('renders canvas when riveAssetPath provided', () => {
    render(<AvatarCanvas state="ready" riveAssetPath="assets/avatars/test.riv" />);
    expect(screen.getByTestId('avatar-canvas')).toBeInTheDocument();
  });

  it('renders different emoji for each state', () => {
    const { rerender } = render(<AvatarCanvas state="ready" />);
    expect(screen.getByText('😊')).toBeInTheDocument();

    rerender(<AvatarCanvas state="thinking" />);
    expect(screen.getByText('🤔')).toBeInTheDocument();
  });

  it('renders brain emoji for deep-thinking state', () => {
    render(<AvatarCanvas state="deep-thinking" />);
    expect(screen.getByText('🧠')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar is deep-thinking')).toBeInTheDocument();
  });
});
