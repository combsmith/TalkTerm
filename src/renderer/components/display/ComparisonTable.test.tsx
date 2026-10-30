// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ComparisonTable, type ComparisonRow } from './ComparisonTable';

const rows: ComparisonRow[] = [
  {
    name: 'Approach A',
    scores: { speed: 4, cost: 3 },
    details: 'Detailed analysis',
    isWinner: true,
  },
  { name: 'Approach B', scores: { speed: 2, cost: 5 } },
];

describe('ComparisonTable', () => {
  it('renders all rows', () => {
    render(<ComparisonTable rows={rows} criteria={['speed', 'cost']} />);
    expect(screen.getByText('Approach A')).toBeInTheDocument();
    expect(screen.getByText('Approach B')).toBeInTheDocument();
  });
  it('expands details on click', async () => {
    const user = userEvent.setup();
    render(<ComparisonTable rows={rows} criteria={['speed', 'cost']} />);
    await user.click(screen.getByText('Approach A'));
    expect(screen.getByText('Detailed analysis')).toBeInTheDocument();
  });

  it('collapses details on second click', async () => {
    const user = userEvent.setup();
    render(<ComparisonTable rows={rows} criteria={['speed', 'cost']} />);
    await user.click(screen.getByText('Approach A'));
    expect(screen.getByText('Detailed analysis')).toBeInTheDocument();
    await user.click(screen.getByText('Approach A'));
    expect(screen.queryByText('Detailed analysis')).not.toBeInTheDocument();
  });

  it('renders score bar for a criterion missing from scores (defaults to 0)', () => {
    const sparseRows: ComparisonRow[] = [{ name: 'Option X', scores: { speed: 4 } }];
    render(<ComparisonTable rows={sparseRows} criteria={['speed', 'weight']} />);
    expect(screen.getByText('weight')).toBeInTheDocument();
  });

  it('renders score bar colors for all thresholds', () => {
    const scoredRows: ComparisonRow[] = [
      { name: 'High', scores: { s: 5 } },
      { name: 'Mid', scores: { s: 3 } },
      { name: 'Low', scores: { s: 1 } },
    ];
    render(<ComparisonTable rows={scoredRows} criteria={['s']} />);
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Mid')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});
