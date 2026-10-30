// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('renders center stage content always', () => {
    render(
      <AppLayout
        mode="conversation"
        leftPanel={<div>Left</div>}
        centerStage={<div>Center</div>}
        rightPanel={<div>Right</div>}
      />,
    );
    expect(screen.getByText('Center')).toBeInTheDocument();
  });

  it('hides left panel in conversation mode', () => {
    render(
      <AppLayout
        mode="conversation"
        leftPanel={<div>Left</div>}
        centerStage={<div>Center</div>}
        rightPanel={<div>Right</div>}
      />,
    );
    const leftPanel = screen.getByText('Left').parentElement;
    expect(leftPanel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows left panel in decision-point mode', () => {
    render(
      <AppLayout
        mode="decision-point"
        leftPanel={<div>Left</div>}
        centerStage={<div>Center</div>}
        rightPanel={<div>Right</div>}
      />,
    );
    const leftPanel = screen.getByText('Left').parentElement;
    expect(leftPanel?.getAttribute('aria-hidden')).toBe('false');
  });

  it('shows right panel in output-only mode', () => {
    render(
      <AppLayout
        mode="output-only"
        leftPanel={<div>Left</div>}
        centerStage={<div>Center</div>}
        rightPanel={<div>Right</div>}
      />,
    );
    const rightPanel = screen.getByText('Right').parentElement;
    expect(rightPanel?.getAttribute('aria-hidden')).toBe('false');
  });

  it('shows both panels in output-review mode', () => {
    render(
      <AppLayout
        mode="output-review"
        leftPanel={<div>Left</div>}
        centerStage={<div>Center</div>}
        rightPanel={<div>Right</div>}
      />,
    );
    expect(screen.getByText('Left').parentElement?.getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByText('Right').parentElement?.getAttribute('aria-hidden')).toBe('false');
  });
});
