// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActivityFeed, type FeedEntry } from './ActivityFeed';

const entries: FeedEntry[] = [
  { timestamp: '12:00:01', actionType: 'tool:bash', description: 'Running tests' },
  { timestamp: '12:00:03', actionType: 'tool:edit', description: 'Modified file.ts' },
];

describe('ActivityFeed', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<ActivityFeed entries={entries} visible={false} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders entries when visible', () => {
    render(<ActivityFeed entries={entries} visible={true} />);
    expect(screen.getByText('Running tests')).toBeInTheDocument();
    expect(screen.getByText('[tool:bash]')).toBeInTheDocument();
  });
});
