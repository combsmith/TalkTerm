// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ClusteredCards, type CardCluster } from './ClusteredCards';

const clusters: CardCluster[] = [
  {
    category: 'User Experience',
    ideas: [{ title: 'Better onboarding', priority: 'high' }, { title: 'Dark mode' }],
  },
  { category: 'Performance', ideas: [{ title: 'Caching layer' }] },
];

describe('ClusteredCards', () => {
  it('renders categories with count badges', () => {
    render(<ClusteredCards clusters={clusters} />);
    expect(screen.getByText('User Experience')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
  it('expands to show ideas', async () => {
    const user = userEvent.setup();
    render(<ClusteredCards clusters={clusters} />);
    await user.click(screen.getByText('User Experience'));
    expect(screen.getByText('Better onboarding')).toBeInTheDocument();
  });
  it('shows priority tags', async () => {
    const user = userEvent.setup();
    render(<ClusteredCards clusters={clusters} />);
    await user.click(screen.getByText('User Experience'));
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('collapses an expanded category on second click', async () => {
    const user = userEvent.setup();
    render(<ClusteredCards clusters={clusters} />);
    await user.click(screen.getByText('User Experience'));
    expect(screen.getByText('Better onboarding')).toBeInTheDocument();
    await user.click(screen.getByText('User Experience'));
    expect(screen.queryByText('Better onboarding')).not.toBeInTheDocument();
  });

  it('shows low priority tag with muted color', async () => {
    const user = userEvent.setup();
    const lowPriorityClusters: CardCluster[] = [
      { category: 'Tech', ideas: [{ title: 'Refactor', priority: 'low' }] },
    ];
    render(<ClusteredCards clusters={lowPriorityClusters} />);
    await user.click(screen.getByText('Tech'));
    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('shows medium priority tag', async () => {
    const user = userEvent.setup();
    const medClusters: CardCluster[] = [
      { category: 'Design', ideas: [{ title: 'Theme', priority: 'medium' }] },
    ];
    render(<ClusteredCards clusters={medClusters} />);
    await user.click(screen.getByText('Design'));
    expect(screen.getByText('medium')).toBeInTheDocument();
  });
});
