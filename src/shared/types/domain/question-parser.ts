/**
 * Strip markdown formatting from a string, returning plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((segment) => {
      if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
        return segment.slice(1, -1);
      }
      return segment
        .replace(/\*\*(.+?)\*\*/g, '$1') // bold
        .replace(/\*(.+?)\*/g, '$1') // italic
        .replace(/(?<!\w)__(.+?)__(?!\w)/g, '$1') // bold (underscore at word boundaries)
        .replace(/(?<!\w)_([^_\s\n](?:[^_\n]*?[^_\s\n])?)_(?!\w)/g, '$1') // italic (underscore at word boundaries)
        .replace(/~~(.+?)~~/g, '$1') // strikethrough
        .replace(/^#{1,6}[ \t]+/gm, '') // headings
        .replace(/^[ \t]*[-*+][ \t]+/gm, '') // list items
        .replace(/^[ \t]*\d+[.)][ \t]+/gm, '') // numbered items
        .replace(/\[([^\][]+)\]\([^()]+\)/g, '$1'); // links
    })
    .join('')
    .trim();
}

export interface Question {
  index: number;
  title: string;
  body: string;
  suggestions: string[];
}

export interface QuestionSet {
  kind?: 'questions' | 'menu';
  preamble: string;
  questions: Question[];
}

/** Regex matching lines that start a numbered item: "1. " or "1) " */
const NUMBERED_LINE_RE = /^(\d+)[.)]\s/;

/**
 * Parse agent text into structured questions.
 * Supports two formats:
 *   1. Numbered items: "1. **Title** — question?"
 *   2. Dash-list items under bold headers: "**Section:** \n - question?"
 * Returns null if fewer than 2 questions are detected.
 */
export function parseQuestions(text: string): QuestionSet | null {
  // Try numbered format first, then dash-list format
  return parseNumberedQuestions(text) ?? parseDashListQuestions(text);
}

/** Collect lines belonging to one numbered block, preserving any trailing instructions. */
function collectBlockLines(lines: string[], start: number, end: number): string[] {
  return lines.slice(start, end);
}

/** Extract the text after a leading `- ` or `* ` marker, or null if not a list item. */
function extractListItemText(trimmed: string): string | null {
  if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
    return null;
  }
  const rest = trimmed.slice(1);
  if (!rest.startsWith(' ') && !rest.startsWith('\t')) {
    return null;
  }
  const content = rest.trimStart();
  return content !== '' ? content : null;
}

/** Extract dash-list or asterisk-list suggestion items from a block. */
function extractSuggestions(blockLines: string[]): string[] {
  const suggestions: string[] = [];
  for (const line of blockLines.slice(1)) {
    const captured = extractListItemText(line.trim());
    if (captured !== null) {
      suggestions.push(captured);
    }
  }
  return suggestions;
}

/** Strategy 1: Numbered items like "1. **Title** — question?" */
function parseNumberedQuestions(text: string): QuestionSet | null {
  const lines = text.split('\n');

  const numberedIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && NUMBERED_LINE_RE.test(line)) {
      numberedIndices.push(i);
    }
  }

  if (numberedIndices.length < 2) return null;

  const blocks: string[][] = [];
  for (let i = 0; i < numberedIndices.length; i++) {
    const start = numberedIndices[i] ?? 0;
    const nextIdx = numberedIndices[i + 1];
    const end = nextIdx !== undefined ? nextIdx : lines.length;
    blocks.push(collectBlockLines(lines, start, end));
  }

  // Question-ness heuristic: at least one numbered block must contain a question mark
  const looksLikeQuestions = blocks.some((block) => block.some((line) => line.includes('?')));
  if (!looksLikeQuestions) return null;

  const firstIdx = numberedIndices[0] ?? 0;
  const preamble = lines.slice(0, firstIdx).join('\n').trim();

  const questions: Question[] = blocks.map((blockLines, i) => {
    const rawFirst = blockLines[0] ?? '';
    const firstLine = rawFirst.replace(NUMBERED_LINE_RE, '');
    const fullBody = [firstLine, ...blockLines.slice(1)].join('\n').trim();
    return {
      index: i + 1,
      title: extractTitle(firstLine),
      body: fullBody,
      suggestions: extractSuggestions(blockLines),
    };
  });

  return { preamble, questions };
}

/** Return the section label if the trimmed line is a standalone bold section header, or null. */
function detectSectionHeader(trimmed: string): string | null {
  const sectionMatch = /^\*\*([^*]+)\*\*[ \t]*:?$/.exec(trimmed);
  if (sectionMatch !== null && !trimmed.startsWith('-') && !trimmed.startsWith('*  ')) {
    const captured = sectionMatch[1];
    if (captured !== undefined) {
      return captured.replace(/:$/, '').trim();
    }
  }
  return null;
}

/** Return index of first line that is a standalone bold header or a top-level question list item. */
function findPreambleEnd(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith(' ') || line.startsWith('\t')) {
      continue;
    }
    const trimmed = line.trim();
    const itemText = extractListItemText(trimmed);
    if (detectSectionHeader(trimmed) !== null || (itemText !== null && itemText.includes('?'))) {
      return i;
    }
  }
  return lines.length;
}

interface DashQuestionBlock {
  text: string;
  rawLine: string;
  section: string;
  continuationLines: string[];
}

/**
 * Strategy 2: Dash-list questions under bold section headers.
 * Detects patterns like:
 *   **Core concept:**
 *   - Is this a mobile app?
 *   - Do you have a preferred stack?
 *   **Users & roles:**
 *   - Are you thinking three user types?
 * Preserves indented continuation lines, option sub-bullets, and trailing instructions on each
 * question card, or returns null when non-question content before the first question would be lost.
 */
function parseDashListQuestions(text: string): QuestionSet | null {
  const lines = text.split('\n');
  const preambleEnd = findPreambleEnd(lines);

  const questionBlocks: DashQuestionBlock[] = [];
  let currentSection = '';
  let pendingSection: { headerLine: string; sectionName: string } | null = null;
  let currentQuestion: DashQuestionBlock | undefined;

  for (let i = preambleEnd; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      if (currentQuestion !== undefined && currentQuestion.continuationLines.length > 0) {
        currentQuestion.continuationLines.push('');
      }
      continue;
    }

    const isIndented = line.startsWith(' ') || line.startsWith('\t');
    const newSection = !isIndented ? detectSectionHeader(trimmed) : null;
    if (newSection !== null) {
      if (pendingSection !== null) {
        if (currentQuestion === undefined) {
          return null;
        }
        currentQuestion.continuationLines.push(pendingSection.headerLine);
      }
      pendingSection = { headerLine: line, sectionName: newSection };
      continue;
    }

    const itemText = !isIndented ? extractListItemText(trimmed) : null;
    if (itemText !== null && itemText.includes('?')) {
      if (pendingSection !== null) {
        currentSection = pendingSection.sectionName;
        pendingSection = null;
      }
      currentQuestion = {
        text: itemText,
        rawLine: line,
        section: currentSection,
        continuationLines: [],
      };
      questionBlocks.push(currentQuestion);
      continue;
    }

    // Continuation line, indented option sub-bullet, or trailing instruction:
    // if no question has started yet, we cannot attach it to a card without losing ordering/context.
    if (currentQuestion === undefined) {
      return null;
    }
    if (pendingSection !== null) {
      currentQuestion.continuationLines.push(pendingSection.headerLine);
      pendingSection = null;
    }
    currentQuestion.continuationLines.push(line);
  }

  if (pendingSection !== null) {
    if (currentQuestion === undefined) {
      return null;
    }
    currentQuestion.continuationLines.push(pendingSection.headerLine);
  }

  if (questionBlocks.length < 2) return null;

  const preamble = lines.slice(0, preambleEnd).join('\n').trim();

  // Convert each question block into a Question, preserving continuation lines and sub-options
  const questions: Question[] = questionBlocks.map((q, i) => {
    const title = extractTitle(q.text);
    const sectionPrefix = q.section !== '' ? `${q.section}: ` : '';
    const body = [q.text, ...q.continuationLines].join('\n').trim();
    return {
      index: i + 1,
      title: sectionPrefix + title,
      body,
      suggestions: extractSuggestions([q.rawLine, ...q.continuationLines]),
    };
  });

  return { preamble, questions };
}

/** Extract a concise title from the first line of a question block. */
function extractTitle(line: string): string {
  // Try bold text first: **Title**
  const boldMatch = /\*\*(.+?)\*\*/.exec(line);
  if (boldMatch !== null) {
    const captured = boldMatch[1];
    if (captured !== undefined) {
      return captured;
    }
  }

  // Try up to first question mark
  const qIndex = line.indexOf('?');
  if (qIndex !== -1) {
    return line.slice(0, qIndex + 1).trim();
  }

  // Try up to first em dash
  const dashIndex = line.indexOf('—');
  if (dashIndex !== -1) {
    return line.slice(0, dashIndex).trim();
  }

  // Fallback: first sentence or full line
  const periodIndex = line.indexOf('.');
  if (periodIndex !== -1 && periodIndex < line.length - 1) {
    return line.slice(0, periodIndex + 1).trim();
  }

  return line.trim();
}
