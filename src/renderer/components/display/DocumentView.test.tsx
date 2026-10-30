// @vitest-environment jsdom
import os from 'node:os';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DocumentView } from './DocumentView';

const testFilePath = path.join(os.tmpdir(), 'talkterm-test', 'output.md');

describe('DocumentView', () => {
  it('renders markdown content', () => {
    render(<DocumentView markdown="# Hello World" />);
    expect(screen.getByText('# Hello World')).toBeInTheDocument();
  });
  it('shows file path when provided', () => {
    render(<DocumentView markdown="content" filePath={testFilePath} />);
    expect(
      screen.getByText(new RegExp(testFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeInTheDocument();
  });
  it('does not show file path when not provided', () => {
    render(<DocumentView markdown="content" />);
    expect(screen.queryByText(/Saved to/)).not.toBeInTheDocument();
  });
});
