// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('renders nothing in ready state', () => {
    const { container } = render(<StatusIndicator state="ready" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Listening in listening state', () => {
    render(<StatusIndicator state="listening" />);
    expect(screen.getByText('Listening...')).toBeInTheDocument();
  });

  it('shows Thinking in thinking state', () => {
    render(<StatusIndicator state="thinking" />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('shows custom context text in thinking state', () => {
    render(<StatusIndicator state="thinking" contextText="Analyzing your ideas..." />);
    expect(screen.getByText('Analyzing your ideas...')).toBeInTheDocument();
  });

  it('shows Speaking in speaking state', () => {
    render(<StatusIndicator state="speaking" />);
    expect(screen.getByText('Speaking')).toBeInTheDocument();
  });

  it('shows Deep thinking in deep-thinking state', () => {
    render(<StatusIndicator state="deep-thinking" />);
    expect(screen.getByText('Deep thinking...')).toBeInTheDocument();
  });

  it('has role=status for accessibility', () => {
    render(<StatusIndicator state="listening" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
