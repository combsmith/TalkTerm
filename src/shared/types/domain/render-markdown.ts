/**
 * Content-type detection and markdown parsing utilities for the conversation display layer.
 */

export type ContentType = 'document' | 'comparison-table' | 'plan' | 'clustered-cards' | 'text';

/** Minimum character length to qualify as a document. */
const DOCUMENT_THRESHOLD = 600;

/** Detect whether a block of text qualifies as long-form document content. */
export function isDocumentContent(text: string): boolean {
  return text.length >= DOCUMENT_THRESHOLD;
}

/**
 * Heuristic content-type detection for agent output.
 * Returns the most likely rendering mode for the given markdown text.
 */
export function detectContentType(text: string): ContentType {
  // Check for markdown table patterns (pipe-delimited rows)
  const tableLineCount = (text.match(/^\|.+\|$/gm) ?? []).length;
  if (tableLineCount >= 3) {
    return 'comparison-table';
  }

  // Check for plan-like content (numbered steps with headings or checkboxes)
  const planIndicators = (text.match(/^(\d+[.)]\s|[-*]\s\[[ x]\])/gm) ?? []).length;
  if (planIndicators >= 3) {
    return 'plan';
  }

  // Check for clustered/categorized content (multiple bold headers with list items)
  const boldHeaders = (text.match(/^\*\*.+\*\*/gm) ?? []).length;
  const listItems = (text.match(/^[ \t]*[-*][ \t]+/gm) ?? []).length;
  if (boldHeaders >= 2 && listItems >= 4) {
    return 'clustered-cards';
  }

  // Long content → document
  if (isDocumentContent(text)) {
    return 'document';
  }

  return 'text';
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

/** Parse a markdown table into structured header + row data. */
export function parseMarkdownTable(text: string): TableData {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const parseCells = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = parseCells(lines[0] ?? '');
  // Skip the separator line (index 1)
  const rows = lines.slice(2).map(parseCells);
  return { headers, rows };
}

export interface PlanStep {
  title: string;
  description: string;
  done: boolean;
}

/** Parse plan/checklist content into structured steps. */
export function parsePlanContent(text: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const prefixMatch = /^(?:\d+[.)]|[-*])[ \t]+/.exec(trimmed);
    if (prefixMatch !== null) {
      let remainder = trimmed.slice(prefixMatch[0].length);
      let done = false;
      const checkboxMatch = /^\[([xX ])\][ \t]+/.exec(remainder);
      if (checkboxMatch !== null) {
        done = checkboxMatch[1]?.toLowerCase() === 'x';
        remainder = remainder.slice(checkboxMatch[0].length);
      }
      if (remainder !== '') {
        const dashIdx = remainder.indexOf('—');
        const title = dashIdx !== -1 ? remainder.slice(0, dashIdx).trim() : remainder.trim();
        const description = dashIdx !== -1 ? remainder.slice(dashIdx + 1).trim() : '';
        steps.push({ title, description, done });
      }
    }
  }
  return steps;
}

export interface ClusteredGroup {
  heading: string;
  items: string[];
}

/** Parse bold-header + list-item clusters into structured groups. */
export function parseClusteredContent(text: string): ClusteredGroup[] {
  const groups: ClusteredGroup[] = [];
  let current: ClusteredGroup | null = null;
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = /^\*\*(.+?)\*\*/.exec(trimmed);
    if (headerMatch !== null && !trimmed.startsWith('-')) {
      if (current !== null) {
        groups.push(current);
      }
      current = { heading: headerMatch[1] ?? '', items: [] };
      continue;
    }
    const itemMatch = /^[-*][ \t]+(\S.*)$/.exec(trimmed);
    if (itemMatch !== null && current !== null) {
      current.items.push(itemMatch[1] ?? '');
    }
  }
  if (current !== null) {
    groups.push(current);
  }
  return groups;
}
