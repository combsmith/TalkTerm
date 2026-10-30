import { describe, it, expect } from 'vitest';
import {
  detectContentType,
  isDocumentContent,
  parseMarkdownTable,
  parsePlanContent,
  parseClusteredContent,
  splitLosslessPlan,
} from './render-markdown';

describe('isDocumentContent', () => {
  it('returns false for short text', () => {
    expect(isDocumentContent('Hello world')).toBe(false);
  });

  it('returns true for text at or above the 600-char threshold', () => {
    const longText = 'a'.repeat(600);
    expect(isDocumentContent(longText)).toBe(true);
  });

  it('returns false for text just below the threshold', () => {
    const text = 'a'.repeat(599);
    expect(isDocumentContent(text)).toBe(false);
  });
});

describe('detectContentType', () => {
  it('returns "text" for short plain text', () => {
    expect(detectContentType('Just a short message.')).toBe('text');
  });

  it('returns "document" for long plain text', () => {
    const longText = 'This is a long document. '.repeat(50);
    expect(detectContentType(longText)).toBe('document');
  });

  it('returns "comparison-table" when text contains a markdown table', () => {
    const table = [
      '| Feature | Plan A | Plan B |',
      '|---------|--------|--------|',
      '| Price   | $10    | $20    |',
      '| Support | Email  | Phone  |',
    ].join('\n');
    expect(detectContentType(table)).toBe('comparison-table');
  });

  it('returns "document" when a markdown table is accompanied by surrounding prose or warnings', () => {
    const tableWithWarning = [
      'Warning: Do not apply these settings to production.',
      '',
      '| Setting | Staging | Production |',
      '|---------|---------|------------|',
      '| Debug   | true    | false      |',
      '',
      'Run `npm run verify` after updating staging.',
    ].join('\n');
    expect(detectContentType(tableWithWarning)).toBe('document');
  });

  it('returns "plan" for numbered steps with checkboxes', () => {
    const plan = ['- [x] Set up project', '- [ ] Write tests', '- [ ] Deploy to production'].join(
      '\n',
    );
    expect(detectContentType(plan)).toBe('plan');
  });

  it('returns "plan" for numbered step format', () => {
    const plan = ['1. Install dependencies', '2. Configure environment', '3. Run migrations'].join(
      '\n',
    );
    expect(detectContentType(plan)).toBe('plan');
  });

  it('does not route to the plan panel when steps carry indented instructions (lossy)', () => {
    const migration = [
      '1. Back up the database',
      '   pg_dump -Fc prod > backup.dump',
      '2. Run the migration',
      '   npm run migrate -- --env staging',
      '3. Verify',
      '   npm run verify',
    ].join('\n');
    expect(detectContentType(migration)).toBe('text');
    // Long lossy plans fall back to the document view, which keeps every line
    expect(detectContentType(`${migration}\n${'Only run this on staging. '.repeat(30)}`)).toBe(
      'document',
    );
  });

  it('does not route to the plan panel when explanation follows the steps', () => {
    const plan = [
      '1. Back up the database',
      '2. Run the migration',
      '3. Verify',
      'Roll back with the backup if verification fails.',
    ].join('\n');
    expect(detectContentType(plan)).toBe('text');
  });

  it('still returns "plan" with a single intro line before the steps', () => {
    const plan = ["Here's the plan:", '1. Install', '2. Configure', '3. Run'].join('\n');
    expect(detectContentType(plan)).toBe('plan');
  });
});

describe('splitLosslessPlan', () => {
  it('returns an empty intro for step-only content (blank lines allowed)', () => {
    expect(splitLosslessPlan('1. A\n\n2. B\n- [ ] C')).toEqual({ intro: '' });
  });

  it('returns the single intro line', () => {
    expect(splitLosslessPlan("Here's the plan:\n1. A\n2. B")).toEqual({
      intro: "Here's the plan:",
    });
  });

  it('returns null for more than one intro line', () => {
    expect(splitLosslessPlan('Intro one.\nIntro two.\n1. A\n2. B')).toBeNull();
  });

  it('returns null when there are no steps', () => {
    expect(splitLosslessPlan('Just prose.')).toBeNull();
  });

  it('returns null when a non-step line appears after the steps begin', () => {
    expect(splitLosslessPlan('1. A\n   detail\n2. B')).toBeNull();
  });
});

describe('detectContentType (continued)', () => {
  it('returns "clustered-cards" for bold headers with list items', () => {
    const clustered = [
      '**Frontend**',
      '- React',
      '- TypeScript',
      '**Backend**',
      '- Node.js',
      '- PostgreSQL',
    ].join('\n');
    expect(detectContentType(clustered)).toBe('clustered-cards');
  });

  it('does not route to clustered-cards when surrounding prose would be discarded', () => {
    const withTrailingNote = [
      '**Frontend**',
      '- React',
      '- TypeScript',
      '**Backend**',
      '- Node.js',
      '- PostgreSQL',
      'Important: confirm database credentials before deploying.',
    ].join('\n');
    expect(detectContentType(withTrailingNote)).toBe('text');

    const withLeadingProse = [
      'Overview of stack:',
      '**Frontend**',
      '- React',
      '- TypeScript',
      '**Backend**',
      '- Node.js',
      '- PostgreSQL',
    ].join('\n');
    expect(detectContentType(withLeadingProse)).toBe('text');
  });

  it('prioritizes comparison-table over other types', () => {
    const table = [
      '| Col A | Col B |',
      '|-------|-------|',
      '| 1     | 2     |',
      '| 3     | 4     |',
    ].join('\n');
    expect(detectContentType(table)).toBe('comparison-table');
  });
});

describe('parseMarkdownTable', () => {
  it('parses a standard markdown table into headers and rows', () => {
    const table = ['| Name  | Age |', '|-------|-----|', '| Alice | 30  |', '| Bob   | 25  |'].join(
      '\n',
    );
    const result = parseMarkdownTable(table);
    expect(result.headers).toEqual(['Name', 'Age']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['Alice', '30']);
    expect(result.rows[1]).toEqual(['Bob', '25']);
  });

  it('returns empty headers and rows for non-table content', () => {
    const result = parseMarkdownTable('Just some regular text.');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns empty when only one pipe line exists', () => {
    const result = parseMarkdownTable('| Only one line |');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('handles a table with surrounding non-table text', () => {
    const text = [
      'Here is a comparison:',
      '| Tool   | Stars |',
      '|--------|-------|',
      '| Vite   | 60k   |',
      '',
      'That is all.',
    ].join('\n');
    const result = parseMarkdownTable(text);
    expect(result.headers).toEqual(['Tool', 'Stars']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['Vite', '60k']);
  });

  it('preserves interior empty cells and dash placeholders without shifting columns', () => {
    const table = [
      '| Product | Price | Available |',
      '|---------|-------|-----------|',
      '| Alpha   |       | Yes       |',
      '| Beta    | ---   | -         |',
    ].join('\n');
    const result = parseMarkdownTable(table);
    expect(result.headers).toEqual(['Product', 'Price', 'Available']);
    expect(result.rows).toEqual([
      ['Alpha', '', 'Yes'],
      ['Beta', '---', '-'],
    ]);
  });

  it('preserves escaped pipes and pipes inside inline code spans without splitting cells', () => {
    const table = [
      '| Command                | Purpose               |',
      '|------------------------|-----------------------|',
      '| cat app.log \\| head   | Inspect start of log  |',
      '| `grep foo | wc -l`     | Count matching lines  |',
    ].join('\n');
    expect(detectContentType(table)).toBe('comparison-table');
    const result = parseMarkdownTable(table);
    expect(result.headers).toEqual(['Command', 'Purpose']);
    expect(result.rows).toEqual([
      ['cat app.log | head', 'Inspect start of log'],
      ['`grep foo | wc -l`', 'Count matching lines'],
    ]);
  });

  it('falls back to document when a table row has extra unescaped cells beyond the headers', () => {
    const malformedTable = ['| Command | Purpose |', '|---------|---------|', '| a | b | c |'].join(
      '\n',
    );
    expect(detectContentType(malformedTable)).toBe('document');
  });
});

describe('parsePlanContent', () => {
  it('parses numbered steps with title and description', () => {
    const text = [
      '1. Setup project — Initialize the repo and install deps',
      '2. Write code — Implement the feature',
    ].join('\n');
    const steps = parsePlanContent(text);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({
      title: 'Setup project',
      description: 'Initialize the repo and install deps',
      done: false,
    });
  });

  it('parses checkbox steps and detects done state', () => {
    const text = [
      '- [x] Install dependencies',
      '- [ ] Configure environment',
      '- [x] Run tests',
    ].join('\n');
    const steps = parsePlanContent(text);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.done).toBe(true);
    expect(steps[1]?.done).toBe(false);
    expect(steps[2]?.done).toBe(true);
  });

  it('returns empty array for non-plan text', () => {
    const steps = parsePlanContent('Just a regular paragraph with no steps.');
    expect(steps).toEqual([]);
  });

  it('handles steps without descriptions (no em-dash)', () => {
    const text = '1. First step\n2. Second step';
    const steps = parsePlanContent(text);
    expect(steps[0]).toEqual({ title: 'First step', description: '', done: false });
    expect(steps[1]).toEqual({ title: 'Second step', description: '', done: false });
  });
});

describe('parseClusteredContent', () => {
  it('parses bold headers with list items into groups', () => {
    const text = ['**Frontend**', '- React', '- Vue', '**Backend**', '- Express', '- Fastify'].join(
      '\n',
    );
    const groups = parseClusteredContent(text);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ heading: 'Frontend', items: ['React', 'Vue'] });
    expect(groups[1]).toEqual({ heading: 'Backend', items: ['Express', 'Fastify'] });
  });

  it('returns empty array for text without bold headers', () => {
    const groups = parseClusteredContent('No headers here, just plain text.');
    expect(groups).toEqual([]);
  });

  it('handles a single group with multiple items', () => {
    const text = ['**Languages**', '- TypeScript', '- Rust', '- Go'].join('\n');
    const groups = parseClusteredContent(text);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.heading).toBe('Languages');
    expect(groups[0]?.items).toEqual(['TypeScript', 'Rust', 'Go']);
  });

  it('ignores list items that appear before any header', () => {
    const text = ['- orphan item', '**Tools**', '- Vite'].join('\n');
    const groups = parseClusteredContent(text);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual(['Vite']);
  });
});
