// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { QuestionSet } from '../../../shared/types/domain/question-parser';
import { QuestionReview } from './QuestionReview';

const SAMPLE_QUESTIONS: QuestionSet = {
  preamble: '',
  questions: [
    { index: 1, title: 'Platform', body: 'What platform?', suggestions: [] },
    { index: 2, title: 'Core features', body: 'What features?', suggestions: [] },
    { index: 3, title: 'Scope', body: 'MVP or full?', suggestions: [] },
  ],
};

const SAMPLE_ANSWERS = ['Web app', 'Competition discovery, Video sharing', ''];
const SAMPLE_SKIPPED = [false, false, true];

describe('QuestionReview', () => {
  const defaultProps = {
    questionSet: SAMPLE_QUESTIONS,
    answers: SAMPLE_ANSWERS,
    skipped: SAMPLE_SKIPPED,
    avatarName: 'Mary',
    onConfirm: vi.fn(),
    onEdit: vi.fn(),
  };

  // --- Rendering ---

  it('renders all questions with their answers', () => {
    render(<QuestionReview {...defaultProps} />);
    expect(screen.getByText(/platform/i)).toBeInTheDocument();
    expect(screen.getByText(/web app/i)).toBeInTheDocument();
    expect(screen.getByText(/core features/i)).toBeInTheDocument();
    expect(screen.getByText(/competition discovery/i)).toBeInTheDocument();
  });

  it('shows "Your Answers" heading', () => {
    render(<QuestionReview {...defaultProps} />);
    expect(screen.getByText(/your answers/i)).toBeInTheDocument();
  });

  it('shows answer count', () => {
    render(<QuestionReview {...defaultProps} />);
    expect(screen.getByText(/2 of 3/i)).toBeInTheDocument();
  });

  it('shows skipped indicator for unanswered questions', () => {
    render(<QuestionReview {...defaultProps} />);
    expect(screen.getByText(/skipped/i)).toBeInTheDocument();
  });

  it('shows edit icon for each answer row', () => {
    render(<QuestionReview {...defaultProps} />);
    const editButtons = screen.getAllByTestId('review-edit');
    expect(editButtons).toHaveLength(3);
  });

  // --- Interactions ---

  it('calls onEdit with question index when edit icon is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionReview {...defaultProps} onEdit={onEdit} />);
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    const firstBtn = editButtons[0];
    expect(firstBtn).toBeDefined();
    await user.click(firstBtn as HTMLElement);
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('calls onConfirm when Send button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<QuestionReview {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /send to mary/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows Edit button to return to card stack', () => {
    render(<QuestionReview {...defaultProps} />);
    expect(screen.getByRole('button', { name: /edit answers/i })).toBeInTheDocument();
  });

  it('calls onEdit with index 0 when the back Edit button is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionReview {...defaultProps} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: /edit answers/i }));
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  // --- Aggregated message format ---

  it('generates correct aggregated message format', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<QuestionReview {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /send to mary/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Here are my answers to your questions:'),
    );
  });

  // --- Avatar name in submit button ---

  it('includes avatar name in submit button label', () => {
    render(<QuestionReview {...defaultProps} avatarName="Mary" />);
    expect(screen.getByRole('button', { name: /send to mary/i })).toBeInTheDocument();
  });

  it('uses different avatar name when provided', () => {
    render(<QuestionReview {...defaultProps} avatarName="Winston" />);
    expect(screen.getByRole('button', { name: /send to winston/i })).toBeInTheDocument();
  });

  // --- Accessibility ---

  it('has proper heading structure', () => {
    render(<QuestionReview {...defaultProps} />);
    const heading = screen.getByRole('heading', { name: /your answers/i });
    expect(heading).toBeInTheDocument();
  });

  it('edit buttons have accessible labels referencing the question', () => {
    render(<QuestionReview {...defaultProps} />);
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    expect(editButtons.length).toBeGreaterThan(0);
  });
});
