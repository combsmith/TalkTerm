import { describe, it, expect } from 'vitest';
import { parseQuestions, stripMarkdown } from './question-parser';

describe('stripMarkdown', () => {
  it('preserves snake_case identifiers inside inline code and in plain text while stripping emphasis', () => {
    expect(stripMarkdown('Run `npm run db_migrate_prod` before restarting.')).toBe(
      'Run npm run db_migrate_prod before restarting.',
    );
    expect(stripMarkdown('Check src/my_file_name.ts and _italic text_ or __bold text__.')).toBe(
      'Check src/my_file_name.ts and italic text or bold text.',
    );
  });
});

describe('parseQuestions', () => {
  // --- Detection threshold ---

  it('returns null for text with no numbered questions', () => {
    const result = parseQuestions('Just a regular response with no questions.');
    expect(result).toBeNull();
  });

  it('returns null for text with only one numbered question', () => {
    const result = parseQuestions(
      'Here is my thought:\n1. **Platform** — What platform are you targeting?',
    );
    expect(result).toBeNull();
  });

  it('returns a QuestionSet for text with two or more numbered questions', () => {
    const text = '1. **Platform** — What platform?\n2. **Scope** — What scope?';
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.questions).toHaveLength(2);
  });

  // --- Preamble extraction ---

  it('extracts preamble text before the first numbered question', () => {
    const text =
      "That's a great idea! A few questions:\n1. **Platform** — iOS or Android?\n2. **Scope** — MVP or full?";
    const result = parseQuestions(text);
    expect(result?.preamble).toBe("That's a great idea! A few questions:");
  });

  it('returns empty preamble when text starts with a numbered question', () => {
    const text = '1. **Platform** — iOS or Android?\n2. **Scope** — MVP or full?';
    const result = parseQuestions(text);
    expect(result?.preamble).toBe('');
  });

  // --- Question title extraction ---

  it('extracts title from bold text', () => {
    const text = '1. **Platform** — Are you thinking mobile or web?\n2. **Scope** — MVP or full?';
    const result = parseQuestions(text);
    expect(result?.questions[0]?.title).toBe('Platform');
    expect(result?.questions[1]?.title).toBe('Scope');
  });

  it('extracts title from first sentence when no bold text', () => {
    const text = '1. What platform are you targeting?\n2. What is your preferred tech stack?';
    const result = parseQuestions(text);
    expect(result?.questions[0]?.title).toContain('platform');
  });

  it('extracts title up to question mark when no bold or dash', () => {
    const text = '1. Are you thinking mobile?\n2. What scope do you want?';
    const result = parseQuestions(text);
    expect(result?.questions[0]?.title).toBeTruthy();
    expect(result?.questions[1]?.title).toBeTruthy();
  });

  // --- Question body extraction ---

  it('extracts the full question body including sub-items', () => {
    const text = [
      'Some preamble.',
      '1. **Core features** — What are the must-haves? For example:',
      '- Competition discovery',
      '- Coach messaging',
      '- Video sharing',
      '2. **Scope** — MVP or full?',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result?.questions[0]?.body).toContain('Competition discovery');
    expect(result?.questions[0]?.body).toContain('Coach messaging');
    expect(result?.questions[0]?.body).toContain('Video sharing');
  });

  // --- Suggestion parsing ---

  it('parses dash-list items as suggestions', () => {
    const text = [
      '1. **Features** — What do you need?',
      '- Competition discovery',
      '- Coach messaging',
      '- Video sharing',
      '2. **Scope** — MVP?',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result?.questions[0]?.suggestions).toEqual([
      'Competition discovery',
      'Coach messaging',
      'Video sharing',
    ]);
  });

  it('parses asterisk-list items as suggestions', () => {
    const text = [
      '1. **Features** — What do you need?',
      '* Competition discovery',
      '* Coach messaging',
      '2. **Scope** — MVP?',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result?.questions[0]?.suggestions).toEqual(['Competition discovery', 'Coach messaging']);
  });

  it('returns empty suggestions when question has no list items', () => {
    const text = '1. **Platform** — iOS or Android?\n2. **Scope** — MVP or full?';
    const result = parseQuestions(text);
    expect(result?.questions[0]?.suggestions).toEqual([]);
    expect(result?.questions[1]?.suggestions).toEqual([]);
  });

  // --- Index tracking ---

  it('assigns correct 1-based index to each question', () => {
    const text = '1. First?\n2. Second?\n3. Third?';
    const result = parseQuestions(text);
    expect(result?.questions[0]?.index).toBe(1);
    expect(result?.questions[1]?.index).toBe(2);
    expect(result?.questions[2]?.index).toBe(3);
  });

  // --- Real-world agent response ---

  it('parses a realistic multi-question agent response', () => {
    const text = [
      "That's a fun concept! Before I start planning anything out, I'd love to understand more about what you're envisioning. A few questions:",
      '1. **Platform** — Are you thinking mobile (iOS, Android, or both), web app, or all of the above?',
      '2. **Core features** — Beyond connecting twirlers with competitions and coaches, what are the must-haves for a first version? For example:',
      '- Competition discovery/registration',
      '- Coach-student messaging',
      '- Practice tracking or video sharing',
      '- Scoring/results',
      '- Profiles for twirlers and coaches',
      '3. **Tech preferences** — Do you have a preferred tech stack, or are you open to recommendations?',
      '4. **Scope** — Are you looking for a full implementation plan, a prototype/MVP, or more of a high-level architecture overview to start?',
      "5. **Users** — Who's the primary audience? Competitive twirlers, recreational, coaches, competition organizers, or all of the above?",
      "Let me know where your head's at and I'll put together a solid plan!",
    ].join('\n');

    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.preamble).toContain('fun concept');
    expect(result?.questions).toHaveLength(5);
    expect(result?.questions[0]?.title).toBe('Platform');
    expect(result?.questions[1]?.title).toBe('Core features');
    expect(result?.questions[1]?.suggestions).toContain('Competition discovery/registration');
    expect(result?.questions[1]?.suggestions).toContain('Coach-student messaging');
    expect(result?.questions[2]?.title).toBe('Tech preferences');
    expect(result?.questions[3]?.title).toBe('Scope');
    expect(result?.questions[4]?.title).toBe('Users');
  });

  // --- Edge cases ---

  it('handles questions numbered with parentheses like "1)"', () => {
    const text = '1) First question?\n2) Second question?';
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.questions).toHaveLength(2);
  });

  it('handles trailing text after the last question', () => {
    const text = [
      '1. **A** — Question A?',
      '2. **B** — Question B?',
      'Let me know your thoughts!',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result?.questions).toHaveLength(2);
    // Trailing text should not create a third question
  });

  it('returns null for numbered list that is not questions', () => {
    const text = 'Here are the steps:\n1. Install Node.js\n2. Run npm install\n3. Start the app';
    const result = parseQuestions(text);
    // Non-question numbered items (no ? mark, no bold interrogative) — parser should return null
    expect(result).toBeNull();
  });

  it('returns null for numbered plan items with bold labels and em-dashes but no question marks', () => {
    const text = '1. **Build** — create the schema\n2. **Test** — run tests';
    expect(parseQuestions(text)).toBeNull();
  });

  // --- Dash-list format (bold headers + dash questions) ---

  it('parses dash-list questions under bold section headers', () => {
    const text = [
      "That's a cool idea! Before I plan, some questions:",
      '',
      '**Core concept:**',
      '- Is this a mobile app (iOS, Android, both), a web app, or both?',
      '- Do you have a preferred tech stack?',
      '',
      '**Users & roles:**',
      '- Are you thinking three main user types — twirlers, coaches, and organizers?',
      '- Should coaches be able to manage multiple twirlers?',
      '',
      '**Scope:**',
      '- Are you looking for a full architecture plan for an MVP?',
      '',
      'Happy to help shape this!',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.preamble).toContain('cool idea');
    expect(result?.questions).toHaveLength(5);
    expect(result?.questions[0]?.title).toContain('Core concept');
    expect(result?.questions[0]?.body).toContain('mobile app');
    expect(result?.questions[2]?.title).toContain('Users & roles');
  });

  it('parses dash-list questions without section headers', () => {
    const text = [
      'A few questions:',
      '- What platform are you targeting?',
      '- What is your budget?',
      '- When do you need this done?',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.questions).toHaveLength(3);
  });

  it('ignores dash-list items without question marks', () => {
    const text = [
      'Here are the steps:',
      '- Install the dependencies',
      '- Configure the server',
      '- Deploy to production',
    ].join('\n');
    const result = parseQuestions(text);
    expect(result).toBeNull();
  });

  // --- extractTitle edge cases (em-dash, period, and plain fallback) ---

  it('extracts title up to em-dash when line has no bold text and no question mark', () => {
    // Two questions needed to pass threshold; only the first exercises the em-dash path
    const text =
      '1. Consider this approach — a detailed rationale\n2. **Platform** — Which platform?';
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    // First question has no bold, no '?', has '—' → em-dash branch
    expect(result?.questions[0]?.title).toBe('Consider this approach');
  });

  it('extracts title up to first period when line has no bold, question mark, or em-dash', () => {
    // "Review the architecture. It covers the key decisions." — no bold, no ?, no —
    const text =
      '1. Review the architecture. It covers the key decisions\n2. **Platform** — Which platform?';
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    // First question: period mid-sentence → period branch
    expect(result?.questions[0]?.title).toBe('Review the architecture.');
  });

  it('returns full trimmed line as title when no bold, question mark, em-dash, or period', () => {
    // No markers at all — hits the fallback return
    const text = '1. Plain title without markers\n2. **Platform** — Which platform?';
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    // First question: no markers → fallback
    expect(result?.questions[0]?.title).toBe('Plain title without markers');
  });

  it('parses real-world bold-header + dash-list agent response', () => {
    const text = [
      "That's a cool niche idea! Baton twirling has a dedicated community. I have some questions to help shape the direction:",
      '',
      '**Core concept:**',
      '- Is this a mobile app (iOS, Android, both), a web app, or both?',
      '- Do you have a preferred tech stack, or are you open to recommendations?',
      '',
      "**Key features — what's most important to start with?**",
      '- **Competitions:** Discovery/search, registration, results tracking, scoring?',
      '- **Coach-twirler connection:** Messaging, video sharing, lesson scheduling, progress tracking?',
      '- **Community:** Social feed, profiles, team/group management?',
      '',
      '**Users & roles:**',
      '- Are you thinking three main user types — twirlers, coaches, and competition organizers?',
      '- Should coaches be able to manage multiple twirlers/teams?',
      '',
      '**Scope:**',
      '- Are you looking for a full architecture plan for an MVP, or more of a feature brainstorm at this stage?',
      '- Any timeline or constraints I should know about?',
      '',
      "Happy to help shape this — just let me know where you'd like to start!",
    ].join('\n');
    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.preamble).toContain('cool niche idea');
    expect(result?.questions.length).toBeGreaterThanOrEqual(7);
    expect(result?.questions[0]?.title).toContain('Core concept');
    expect(result?.questions[2]?.title).toContain('Key features');
  });

  it('preserves indented continuation lines, sub-bullet options, and trailing instructions in dash-list questions', () => {
    const text = [
      'Before deploying, please clarify:',
      '- Which environment should we target?',
      '  Staging only — production deployments are frozen until Monday.',
      '  - staging-us-east',
      '  - staging-eu-west',
      '- Which service should roll out first?',
      '',
      '**Important reminder:**',
      'All migrations must complete before traffic shifts.',
    ].join('\n');

    const result = parseQuestions(text);
    expect(result).not.toBeNull();
    expect(result?.preamble).toBe('Before deploying, please clarify:');
    expect(result?.questions).toHaveLength(2);
    expect(result?.questions[0]?.body).toContain(
      'Staging only — production deployments are frozen until Monday.',
    );
    expect(result?.questions[0]?.suggestions).toEqual(['staging-us-east', 'staging-eu-west']);
    expect(result?.questions[1]?.body).toContain('**Important reminder:**');
    expect(result?.questions[1]?.body).toContain(
      'All migrations must complete before traffic shifts.',
    );
  });

  it('returns null for dash-list questions when non-question content precedes the first question after a section header', () => {
    const text = [
      '**Deployment notes:**',
      'Production is frozen until Monday.',
      '- Which environment?',
      '- Which region?',
    ].join('\n');

    expect(parseQuestions(text)).toBeNull();
  });
});
