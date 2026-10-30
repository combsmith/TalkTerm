// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CaptionBar } from './CaptionBar';

describe('CaptionBar', () => {
  it('renders text when visible', () => {
    render(<CaptionBar text="Hello world" visible={true} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders nothing when text is null', () => {
    const { container } = render(<CaptionBar text={null} visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when text is empty', () => {
    const { container } = render(<CaptionBar text="" visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  describe('3s hide delay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('stays mounted during the 3s fade period after visibility flips to false', () => {
      const { rerender } = render(<CaptionBar text="Fading caption" visible={true} />);
      expect(screen.getByText('Fading caption')).toBeInTheDocument();

      rerender(<CaptionBar text="Fading caption" visible={false} />);

      // Still mounted during fade period
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.getByText('Fading caption')).toBeInTheDocument();
    });

    it('is removed after 3000ms when visibility is false', () => {
      const { rerender, container } = render(<CaptionBar text="Gone soon" visible={true} />);
      expect(screen.getByText('Gone soon')).toBeInTheDocument();

      rerender(<CaptionBar text="Gone soon" visible={false} />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(container.firstChild).toBeNull();
    });

    it('clears timeout when visibility flips back to true before 3s', () => {
      const { rerender } = render(<CaptionBar text="Persistent" visible={true} />);
      expect(screen.getByText('Persistent')).toBeInTheDocument();

      // Flip to false — starts the 3s timer
      rerender(<CaptionBar text="Persistent" visible={false} />);

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText('Persistent')).toBeInTheDocument();

      // Flip back to true — should clear the timer
      rerender(<CaptionBar text="Persistent" visible={true} />);

      // Advance past 3s total — should still be mounted because timer was cleared
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText('Persistent')).toBeInTheDocument();
    });
  });
});
