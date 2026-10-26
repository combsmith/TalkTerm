// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { OutputPanel } from './OutputPanel';

describe('OutputPanel', () => {
  it('renders nothing when mode is none', () => {
    const { container } = render(<OutputPanel mode="none" data={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders document view', () => {
    render(<OutputPanel mode="document" data={{ markdown: '# Hello' }} onClose={vi.fn()} />);
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('# Hello')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<OutputPanel mode="document" data={{ markdown: 'test' }} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<OutputPanel mode="document" data={{ markdown: 'test' }} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders task progress', () => {
    const data = { steps: [{ name: 'Step 1', status: 'completed' as const }] };
    render(<OutputPanel mode="task-progress" data={data} onClose={vi.fn()} />);
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
  });

  it('renders task progress with counters', () => {
    const data = {
      steps: [{ name: 'Step 1', status: 'completed' as const }],
      counters: { total: 5 },
    };
    render(<OutputPanel mode="task-progress" data={data} onClose={vi.fn()} />);
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });

  it('renders document view with filePath', () => {
    render(
      <OutputPanel
        mode="document"
        data={{ markdown: '# Doc', filePath: '/doc.md' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Document')).toBeInTheDocument();
  });

  it('renders comparison table', () => {
    const data = { rows: [{ name: 'A', scores: { speed: 4 } }], criteria: ['speed'] };
    render(<OutputPanel mode="comparison-table" data={data} onClose={vi.fn()} />);
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders clustered cards', () => {
    const data = { clusters: [{ category: 'UI', ideas: [{ title: 'Dark mode' }] }] };
    render(<OutputPanel mode="clustered-cards" data={data} onClose={vi.fn()} />);
    expect(screen.getByText('Ideas')).toBeInTheDocument();
    expect(screen.getByText('UI')).toBeInTheDocument();
  });

  it('renders activity feed', () => {
    const data = {
      entries: [{ timestamp: '12:00', actionType: 'write', description: 'Created file' }],
    };
    render(<OutputPanel mode="activity-feed" data={data} onClose={vi.fn()} />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Created file')).toBeInTheDocument();
  });

  it('renders Preview title for plan-preview mode', () => {
    render(<OutputPanel mode="plan-preview" data={{}} onClose={vi.fn()} />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders parsed markdown table data in comparison-table mode', () => {
    const parsedTable = {
      headers: ['Option', 'Speed', 'Ease'],
      rows: [
        ['Vite', '5', 'Easy'],
        ['Webpack', '3', 'Complex'],
      ],
    };
    render(<OutputPanel mode="comparison-table" data={parsedTable} onClose={vi.fn()} />);
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('Vite')).toBeInTheDocument();
    expect(screen.getByText('Webpack')).toBeInTheDocument();
  });

  it('renders parsed clustered groups in clustered-cards mode', () => {
    const parsedClusters = [{ heading: 'Frontend', items: ['React', 'Tailwind'] }];
    render(<OutputPanel mode="clustered-cards" data={parsedClusters} onClose={vi.fn()} />);
    expect(screen.getByText('Ideas')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });

  it('renders parsed plan steps in plan-preview mode', () => {
    const parsedPlan = [
      { title: 'Step one', description: 'Small scope', done: false },
      { title: 'Step two', description: '', done: true },
      { title: 'Step three', description: '', done: false },
    ];
    render(<OutputPanel mode="plan-preview" data={parsedPlan} onClose={vi.fn()} />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Small scope')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  it('handles pre-normalized plan data and empty fallback payloads', () => {
    render(
      <OutputPanel
        mode="plan-preview"
        data={{
          approach: 'Custom approach',
          steps: [{ number: 1, description: 'Init', estimatedScope: '1h' }],
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Custom approach')).toBeInTheDocument();
    expect(screen.getByText('Init')).toBeInTheDocument();

    render(<OutputPanel mode="comparison-table" data={{}} onClose={vi.fn()} />);
    render(<OutputPanel mode="clustered-cards" data={{}} onClose={vi.fn()} />);
  });
});
