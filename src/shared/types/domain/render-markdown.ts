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
  // Check for markdown table patterns (pipe-delimited rows). When surrounding prose/warnings
  // accompany the table, fall back to the document view so non-table lines are not discarded.
  const tableLineCount = (text.match(/^\|.+\|$/gm) ?? []).length;
  if (tableLineCount >= 3) {
    return isLosslessTable(text) ? 'comparison-table' : 'document';
  }

  // Check for plan-like content (numbered steps with headings or checkboxes). Only route to the
  // plan panel when the conversion is lossless — otherwise fall through so nothing is dropped.
  const planIndicators = (text.match(/^(\d+[.)]\s|[-*]\s\[[ x]\])/gm) ?? []).length;
  if (planIndicators >= 3 && splitLosslessPlan(text) !== null) {
    return 'plan';
  }

  // Check for clustered/categorized content (multiple bold headers with list items). Only route
  // to clustered cards when every line is represented in the parsed groups.
  const boldHeaders = (text.match(/^\*\*.+\*\*/gm) ?? []).length;
  const listItems = (text.match(/^[ \t]*[-*][ \t]+/gm) ?? []).length;
  if (boldHeaders >= 2 && listItems >= 4 && isLosslessClustered(text)) {
    return 'clustered-cards';
  }

  // Long content → document
  if (isDocumentContent(text)) {
    return 'document';
  }

  return 'text';
}

const TABLE_ROW_LINE = /^\|.+\|$/;
const CLUSTER_HEADER_LINE = /^\*\*[^*]+\*\*$/;
const CLUSTER_ITEM_LINE = /^[-*][ \t]+\S/;

/** Check whether every non-empty line in `text` is part of the markdown table. */
function isLosslessTable(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return lines.every((l) => TABLE_ROW_LINE.test(l));
}

/** Check whether every non-empty line in `text` is preserved by `parseClusteredContent`. */
function isLosslessClustered(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (!CLUSTER_HEADER_LINE.test(lines[0] ?? '')) {
    return false;
  }
  return lines.every((l) => CLUSTER_HEADER_LINE.test(l) || CLUSTER_ITEM_LINE.test(l));
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

/** A line the plan parser turns into a step (numbered item, bullet, or checkbox). */
const PLAN_STEP_LINE = /^(?:\d+[.)]|[-*])[ \t]+\S/;

/**
 * Check whether plan-like text can be shown in the plan panel without losing content.
 * Allowed: an optional single intro line before the steps (returned as `intro`), then only
 * step lines and blank lines. Continuation/indented instructions, code, or trailing
 * explanation make the conversion lossy, so null is returned and callers should fall back
 * to the document/text views that preserve the full response.
 */
export function splitLosslessPlan(text: string): { intro: string } | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const firstStep = lines.findIndex((l) => PLAN_STEP_LINE.test(l));
  if (firstStep === -1 || firstStep > 1) {
    return null;
  }
  if (!lines.slice(firstStep).every((l) => PLAN_STEP_LINE.test(l))) {
    return null;
  }
  return { intro: firstStep === 1 ? (lines[0] ?? '') : '' };
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
