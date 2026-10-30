// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TaskProgress, type TaskStep } from './TaskProgress';

const steps: TaskStep[] = [
  { name: 'Analyze requirements', status: 'completed', elapsedMs: 3000 },
  { name: 'Generate ideas', status: 'in-progress' },
  { name: 'Organize output', status: 'pending' },
];

describe('TaskProgress', () => {
  it('renders all steps', () => {
    render(<TaskProgress steps={steps} />);
    expect(screen.getByText('Analyze requirements')).toBeInTheDocument();
    expect(screen.getByText('Generate ideas')).toBeInTheDocument();
  });
  it('shows status icons', () => {
    render(<TaskProgress steps={steps} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('●')).toBeInTheDocument();
    expect(screen.getByText('○')).toBeInTheDocument();
  });
  it('shows elapsed time', () => {
    render(<TaskProgress steps={steps} />);
    expect(screen.getByText('3s')).toBeInTheDocument();
  });
  it('shows counters', () => {
    render(<TaskProgress steps={steps} counters={{ 'ideas generated': 18 }} />);
    expect(screen.getByText('18 ideas generated')).toBeInTheDocument();
  });

  it('renders zero percent progress bar when steps array is empty', () => {
    const { container } = render(<TaskProgress steps={[]} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar).toBeDefined();
    expect(bar.style.width).toBe('0%');
  });
});
