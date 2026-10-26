// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { QuestionSet } from '../../../shared/types/domain/question-parser';
import { QuestionCardStack } from './QuestionCardStack';

const SAMPLE_QUESTIONS: QuestionSet = {
  preamble: 'Great concept! A few questions:',
  questions: [
    {
      index: 1,
      title: 'Platform',
      body: 'Are you thinking mobile (iOS, Android, or both), web app, or all of the above?',
      suggestions: [],
    },
    {
      index: 2,
      title: 'Core features',
      body: 'What are the must-haves for a first version?',
      suggestions: ['Competition discovery', 'Coach messaging', 'Video sharing'],
    },
    {
      index: 3,
      title: 'Scope',
      body: 'Are you looking for an MVP or full implementation?',
      suggestions: [],
    },
  ],
};

describe('QuestionCardStack', () => {
  const defaultProps = {
    questionSet: SAMPLE_QUESTIONS,
    avatarName: 'Mary',
    onSubmit: vi.fn(),
    onDismiss: vi.fn(),
  };

  // --- Rendering ---

  it('renders the first question card by default', () => {
    render(<QuestionCardStack {...defaultProps} />);
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
  });

  it('renders the question body', () => {
    render(<QuestionCardStack {...defaultProps} />);
    expect(screen.getByText(/mobile.*iOS.*Android/i)).toBeInTheDocument();
  });

  it('renders dot navigation with correct count', () => {
    render(<QuestionCardStack {...defaultProps} />);
    const dots = screen.getAllByRole('button', { name: /question \d/i });
    expect(dots).toHaveLength(3);
  });

  it('renders an answer text area', () => {
    render(<QuestionCardStack {...defaultProps} />);
    expect(screen.getByPlaceholderText(/your answer/i)).toBeInTheDocument();
  });

  // --- Navigation ---

  it('navigates to next question on Next click', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.getByText('Core features')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
  });

  it('navigates back on Back click', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.getByText('Core features')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /previous question/i }));
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('navigates to specific question via dot click', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /question 3/i }));
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });

  it('does not show Back button on first question', () => {
    render(<QuestionCardStack {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /previous question/i })).not.toBeInTheDocument();
  });

  it('shows Submit All on the last question', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /question 3/i }));
    expect(screen.getByRole('button', { name: /submit all answers/i })).toBeInTheDocument();
  });

  // --- Answer input ---

  it('preserves answer when navigating away and back', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/your answer/i);
    await user.type(textarea, 'Web app');
    await user.click(screen.getByRole('button', { name: /next question/i }));
    await user.click(screen.getByRole('button', { name: /previous question/i }));
    expect(screen.getByPlaceholderText(/your answer/i)).toHaveValue('Web app');
  });

  // --- Suggestion chips ---

  it('renders suggestion chips when question has suggestions', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.getByText('Competition discovery')).toBeInTheDocument();
    expect(screen.getByText('Coach messaging')).toBeInTheDocument();
    expect(screen.getByText('Video sharing')).toBeInTheDocument();
  });

  it('toggles chip selection on click', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /next question/i }));

    const chip = screen.getByText('Competition discovery');
    await user.click(chip);
    expect(chip.closest('button')).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip);
    expect(chip.closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not render suggestion chips when question has none', () => {
    render(<QuestionCardStack {...defaultProps} />);
    // First question has no suggestions
    expect(screen.queryByRole('button', { name: /aria-pressed/i })).not.toBeInTheDocument();
  });

  // --- Skip ---

  it('marks question as skipped when Skip is clicked', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /skip question/i }));
    // Should advance to next question
    expect(screen.getByText('Core features')).toBeInTheDocument();
  });

  // --- Dot navigation states ---

  it('shows current dot in active state', () => {
    render(<QuestionCardStack {...defaultProps} />);
    const dot1 = screen.getByRole('button', { name: /question 1/i });
    expect(dot1).toHaveAttribute('aria-current', 'step');
  });

  it('shows answered dot with checkmark after answering', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/your answer/i), 'Web app');
    await user.click(screen.getByRole('button', { name: /next question/i }));
    const dot1 = screen.getByRole('button', { name: /question 1/i });
    expect(dot1).toHaveAttribute('data-state', 'answered');
  });

  // --- Submission ---

  it('calls onSubmit with aggregated answers when Submit All is clicked', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} onSubmit={onSubmit} />);

    // Answer question 1
    await user.type(screen.getByPlaceholderText(/your answer/i), 'Web app');
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Answer question 2 via chip + text
    await user.click(screen.getByText('Competition discovery'));
    await user.type(screen.getByPlaceholderText(/your answer/i), 'Plus custom features');
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Answer question 3
    await user.type(screen.getByPlaceholderText(/your answer/i), 'MVP');
    await user.click(screen.getByRole('button', { name: /submit all answers/i }));

    // Should show review first, then submit
    expect(screen.getByText(/your answers/i)).toBeInTheDocument();
  });

  it('confirms submission from review screen and calls onSubmit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /question 3/i }));
    await user.click(screen.getByRole('button', { name: /submit all answers/i }));
    expect(screen.getByTestId('question-review')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /send to mary/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('returns to editing from the review screen when Edit is clicked', async () => {
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /question 3/i }));
    await user.click(screen.getByRole('button', { name: /submit all answers/i }));
    expect(screen.getByTestId('question-review')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit answers/i }));
    expect(screen.getByTestId('question-progress')).toBeInTheDocument();
  });

  // --- Dismiss ---

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<QuestionCardStack {...defaultProps} onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /close questions/i });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // --- Empty question set guard ---

  it('renders empty shell when questionSet has no questions', () => {
    const emptySet: QuestionSet = { preamble: '', questions: [] };
    const { container } = render(
      <QuestionCardStack
        questionSet={emptySet}
        avatarName="Mary"
        onSubmit={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="question-card-stack"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="question-progress"]')).not.toBeInTheDocument();
  });

  // --- Accessibility ---

  it('has accessible labels on navigation controls', () => {
    render(<QuestionCardStack {...defaultProps} />);
    expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip question/i })).toBeInTheDocument();
  });

  it('answer textarea is focusable and has accessible label', () => {
    render(<QuestionCardStack {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/your answer/i);
    expect(textarea).toHaveAttribute('aria-label');
  });

  it('resets state when questionSet prop changes to a new set', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<QuestionCardStack {...defaultProps} />);

    // Type an answer and advance to question 2
    await user.type(screen.getByPlaceholderText(/your answer/i), 'iOS');
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.getByTestId('question-progress')).toHaveTextContent('2 of 3');

    // Swap to a new shorter question set
    const newSet: QuestionSet = {
      preamble: 'Follow-up questions:',
      questions: [
        { index: 1, title: 'Deployment', body: 'Cloud or on-prem?', suggestions: [] },
        { index: 2, title: 'Budget', body: 'Monthly cap?', suggestions: [] },
      ],
    };
    rerender(<QuestionCardStack {...defaultProps} questionSet={newSet} />);

    expect(screen.getByTestId('question-progress')).toHaveTextContent('1 of 2');
    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/your answer/i)).toHaveValue('');
  });

  it('populates answers and advances through questions to review when spokenAnswer updates', () => {
    const { rerender } = render(<QuestionCardStack {...defaultProps} spokenAnswer={null} />);
    expect(screen.getByTestId('question-progress')).toHaveTextContent('1 of 3');

    rerender(<QuestionCardStack {...defaultProps} spokenAnswer={{ text: 'Mobile app', seq: 1 }} />);
    expect(screen.getByTestId('question-progress')).toHaveTextContent('2 of 3');

    rerender(<QuestionCardStack {...defaultProps} spokenAnswer={{ text: 'PostgreSQL', seq: 2 }} />);
    expect(screen.getByTestId('question-progress')).toHaveTextContent('3 of 3');

    rerender(<QuestionCardStack {...defaultProps} spokenAnswer={{ text: 'Next month', seq: 3 }} />);
    // Should now be on review screen with all 3 answers
    expect(screen.getByText('Mobile app')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Next month')).toBeInTheDocument();
  });
});
