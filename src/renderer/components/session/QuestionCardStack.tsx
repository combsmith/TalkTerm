import { useEffect, useReducer, useRef, type ReactElement } from 'react';
import type { Question, QuestionSet } from '../../../shared/types/domain/question-parser';
import { QuestionReview } from './QuestionReview';
import { SuggestionChips } from './SuggestionChips';

interface QuestionCardStackProps {
  questionSet: QuestionSet;
  avatarName: string;
  onSubmit: (aggregatedMessage: string) => void;
  onDismiss: () => void;
  spokenAnswer?: { text: string; seq: number } | null | undefined;
  onActiveQuestionChange?: ((question: Question, index: number) => void) | undefined;
}

// --- Reducer ---

interface CardStackState {
  currentIndex: number;
  answers: string[];
  skipped: boolean[];
  selectedChips: string[][];
  showReview: boolean;
}

type CardStackAction =
  | { type: 'go-to'; index: number }
  | { type: 'next'; total: number }
  | { type: 'back' }
  | { type: 'skip'; total: number }
  | { type: 'set-answer'; index: number; text: string }
  | { type: 'answer-and-advance'; text: string; total: number }
  | { type: 'toggle-chip'; questionIndex: number; chip: string }
  | { type: 'show-review' }
  | { type: 'edit-from-review'; index: number }
  | { type: 'reset'; total: number };

function reducer(state: CardStackState, action: CardStackAction): CardStackState {
  switch (action.type) {
    case 'go-to':
      return { ...state, currentIndex: action.index, showReview: false };
    case 'next':
      return {
        ...state,
        currentIndex: Math.min(state.currentIndex + 1, action.total - 1),
      };
    case 'back':
      return {
        ...state,
        currentIndex: Math.max(state.currentIndex - 1, 0),
      };
    case 'skip': {
      const newSkipped = [...state.skipped];
      newSkipped[state.currentIndex] = true;
      return {
        ...state,
        skipped: newSkipped,
        currentIndex: Math.min(state.currentIndex + 1, action.total - 1),
      };
    }
    case 'set-answer': {
      const newAnswers = [...state.answers];
      newAnswers[action.index] = action.text;
      const newSkipped = [...state.skipped];
      newSkipped[action.index] = false;
      return { ...state, answers: newAnswers, skipped: newSkipped };
    }
    case 'answer-and-advance': {
      if (state.showReview) {
        return state;
      }
      const newAnswers = [...state.answers];
      newAnswers[state.currentIndex] = action.text;
      const newSkipped = [...state.skipped];
      newSkipped[state.currentIndex] = false;
      const isLastQuestion = state.currentIndex >= action.total - 1;
      return {
        ...state,
        answers: newAnswers,
        skipped: newSkipped,
        currentIndex: isLastQuestion ? state.currentIndex : state.currentIndex + 1,
        showReview: isLastQuestion ? true : state.showReview,
      };
    }
    case 'toggle-chip': {
      const newChips = state.selectedChips.map((chips) => [...chips]);
      const qChips = newChips[action.questionIndex] ?? [];
      const idx = qChips.indexOf(action.chip);
      if (idx === -1) {
        qChips.push(action.chip);
      } else {
        qChips.splice(idx, 1);
      }
      newChips[action.questionIndex] = qChips;
      const newSkipped = [...state.skipped];
      if (qChips.length > 0) {
        newSkipped[action.questionIndex] = false;
      }
      return { ...state, selectedChips: newChips, skipped: newSkipped };
    }
    case 'show-review':
      return { ...state, showReview: true };
    case 'edit-from-review':
      return { ...state, showReview: false, currentIndex: action.index };
    case 'reset':
      return createInitialState(action.total);
    /* c8 ignore next 3 */
    default:
      const _exhaustive: never = action;
      return _exhaustive;
  }
}

function createInitialState(questionCount: number): CardStackState {
  return {
    currentIndex: 0,
    answers: Array.from<string>({ length: questionCount }).fill(''),
    skipped: Array.from<boolean>({ length: questionCount }).fill(false),
    selectedChips: Array.from<string[]>({ length: questionCount }).map(() => []),
    showReview: false,
  };
}

// --- Component ---

export function QuestionCardStack({
  questionSet,
  avatarName,
  onSubmit,
  onDismiss,
  spokenAnswer,
  onActiveQuestionChange,
}: QuestionCardStackProps): ReactElement {
  const total = questionSet.questions.length;
  const [state, dispatch] = useReducer(reducer, total, createInitialState);
  const prevQuestionSetRef = useRef(questionSet);
  const lastSpokenSeqRef = useRef(spokenAnswer?.seq ?? 0);
  const prevActiveKeyRef = useRef('0:false');

  useEffect(() => {
    if (prevQuestionSetRef.current !== questionSet) {
      prevQuestionSetRef.current = questionSet;
      lastSpokenSeqRef.current = spokenAnswer?.seq ?? 0;
      prevActiveKeyRef.current = '0:false';
      dispatch({ type: 'reset', total: questionSet.questions.length });
    }
  }, [questionSet, spokenAnswer?.seq]);

  useEffect(() => {
    if (
      spokenAnswer !== undefined &&
      spokenAnswer !== null &&
      spokenAnswer.seq !== lastSpokenSeqRef.current
    ) {
      lastSpokenSeqRef.current = spokenAnswer.seq;
      dispatch({
        type: 'answer-and-advance',
        text: spokenAnswer.text,
        total: questionSet.questions.length,
      });
    }
  }, [spokenAnswer, questionSet.questions.length]);

  const currentQuestion = questionSet.questions[state.currentIndex];

  useEffect(() => {
    const activeKey = `${String(state.currentIndex)}:${String(state.showReview)}`;
    if (prevActiveKeyRef.current === activeKey) {
      return;
    }
    prevActiveKeyRef.current = activeKey;
    if (!state.showReview && currentQuestion !== undefined) {
      onActiveQuestionChange?.(currentQuestion, state.currentIndex);
    }
  }, [state.currentIndex, state.showReview, currentQuestion, onActiveQuestionChange]);

  if (currentQuestion === undefined) {
    return <div data-testid="question-card-stack" />;
  }
  const isFirst = state.currentIndex === 0;
  const isLast = state.currentIndex === total - 1;

  function getEffectiveAnswer(index: number): string {
    const chips = state.selectedChips[index] ?? [];
    const typed = state.answers[index] ?? '';
    if (chips.length === 0) return typed;
    if (typed.trim() === '') return chips.join(', ');
    return `${chips.join(', ')}, ${typed}`;
  }

  function getDotState(index: number): 'current' | 'answered' | 'skipped' | 'unanswered' {
    if (index === state.currentIndex) return 'current';
    if (state.skipped[index] === true) return 'skipped';
    const effective = getEffectiveAnswer(index);
    if (effective.trim() !== '') return 'answered';
    return 'unanswered';
  }

  function handleConfirm(aggregatedMessage: string): void {
    onSubmit(aggregatedMessage);
  }

  function handleEditFromReview(index: number): void {
    dispatch({ type: 'edit-from-review', index });
  }

  if (state.showReview) {
    const effectiveAnswers = questionSet.questions.map((_, i) => getEffectiveAnswer(i));
    return (
      <div data-testid="question-card-stack" className="flex h-full flex-col bg-surface-muted">
        <QuestionReview
          questionSet={questionSet}
          answers={effectiveAnswers}
          skipped={state.skipped}
          avatarName={avatarName}
          onConfirm={handleConfirm}
          onEdit={handleEditFromReview}
        />
      </div>
    );
  }

  return (
    <div data-testid="question-card-stack" className="flex h-full flex-col bg-surface-muted">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stage-bg p-3">
        <span data-testid="question-progress" className="text-caption text-text-muted-on-dark">
          {String(state.currentIndex + 1)} of {String(total)}
        </span>
        <button
          type="button"
          aria-label="Close questions"
          onClick={onDismiss}
          className="rounded-md p-1 text-text-muted-on-dark hover:text-text-on-dark"
        >
          ✕
        </button>
      </div>

      {/* Card content */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <h3 data-testid="question-title" className="text-subtitle text-text-on-dark">
          {currentQuestion.title}
        </h3>
        <p data-testid="question-body" className="text-body text-text-muted-on-dark">
          {currentQuestion.body}
        </p>

        {/* Suggestion chips */}
        {currentQuestion.suggestions.length > 0 && (
          <SuggestionChips
            suggestions={currentQuestion.suggestions}
            selected={state.selectedChips[state.currentIndex] ?? []}
            onToggle={(chip) => {
              dispatch({
                type: 'toggle-chip',
                questionIndex: state.currentIndex,
                chip,
              });
            }}
          />
        )}

        {/* Answer input */}
        <textarea
          data-testid="question-answer-input"
          placeholder="Your answer..."
          aria-label={`Answer for question ${String(state.currentIndex + 1)}`}
          value={state.answers[state.currentIndex] ?? ''}
          onChange={(e) => {
            dispatch({
              type: 'set-answer',
              index: state.currentIndex,
              text: e.target.value,
            });
          }}
          rows={3}
          className="resize-none rounded-lg border border-text-muted-on-dark bg-stage-bg px-4 py-3 text-body text-text-on-dark outline-none transition-colors focus:border-primary"
        />
      </div>

      {/* Dot navigation */}
      <div data-testid="dot-navigation" className="flex items-center justify-center gap-2 py-2">
        {questionSet.questions.map((_, i) => {
          const dotState = getDotState(i);
          return (
            <button
              key={i}
              type="button"
              aria-label={`Question ${String(i + 1)}`}
              aria-current={dotState === 'current' ? 'step' : undefined}
              data-state={dotState === 'answered' ? 'answered' : undefined}
              onClick={() => {
                dispatch({ type: 'go-to', index: i });
              }}
              className={`flex h-3 w-3 items-center justify-center rounded-full border transition-colors ${
                dotState === 'current'
                  ? 'border-primary bg-primary'
                  : dotState === 'answered'
                    ? 'border-semantic-success bg-semantic-success'
                    : dotState === 'skipped'
                      ? 'border-text-muted-on-dark bg-transparent'
                      : 'border-[#E0E0E0] bg-transparent'
              }`}
            >
              {dotState === 'skipped' && (
                <span className="text-[8px] text-text-muted-on-dark">–</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-stage-bg p-3">
        <button
          type="button"
          aria-label="Skip question"
          onClick={() => {
            dispatch({ type: 'skip', total });
          }}
          className="text-caption text-text-muted-on-dark hover:text-text-on-dark"
        >
          Skip
        </button>
        <div className="flex gap-2">
          {!isFirst && (
            <button
              type="button"
              aria-label="Previous question"
              onClick={() => {
                dispatch({ type: 'back' });
              }}
              className="rounded-lg border border-text-muted-on-dark px-4 py-2 text-small font-medium text-text-on-dark transition-colors hover:border-primary"
            >
              ← Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              aria-label="Submit all answers"
              onClick={() => {
                dispatch({ type: 'show-review' });
              }}
              className="rounded-lg bg-primary px-4 py-2 text-small font-medium text-stage-bg transition-colors hover:bg-primary-dark"
            >
              Submit All
            </button>
          ) : (
            <button
              type="button"
              aria-label="Next question"
              onClick={() => {
                dispatch({ type: 'next', total });
              }}
              className="rounded-lg bg-primary px-4 py-2 text-small font-medium text-stage-bg transition-colors hover:bg-primary-dark"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
