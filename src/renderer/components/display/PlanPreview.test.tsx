// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlanPreview } from './PlanPreview';

const steps = [
  { number: 1, description: 'Analyze requirements', estimatedScope: '~5 min' },
  { number: 2, description: 'Generate ideas', estimatedScope: '~10 min' },
  { number: 3, description: 'Organize output', estimatedScope: '~3 min' },
];

describe('PlanPreview', () => {
  it('renders approach summary', () => {
    render(<PlanPreview steps={steps} approach="Guided brainstorming with structured output" />);
    expect(screen.getByText('Guided brainstorming with structured output')).toBeInTheDocument();
  });

  it('renders all steps with numbers', () => {
    render(<PlanPreview steps={steps} approach="test" />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows step descriptions and scope', () => {
    render(<PlanPreview steps={steps} approach="test" />);
    expect(screen.getByText('Analyze requirements')).toBeInTheDocument();
    expect(screen.getByText('~5 min')).toBeInTheDocument();
  });
});
