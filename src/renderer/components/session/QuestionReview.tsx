import type { ReactElement } from 'react';
import type { QuestionSet } from '../../../shared/types/domain/question-parser';

interface QuestionReviewProps {
  questionSet: QuestionSet;
  answers: string[];
  skipped: boolean[];
  avatarName: string;
  onConfirm: (aggregatedMessage: string) => void;
  onEdit: (index: number) => void;
}

export function QuestionReview({
  questionSet,
  answers,
  skipped,
  avatarName,
  onConfirm,
  onEdit,
}: QuestionReviewProps): ReactElement {
  const answeredCount = answers.filter((a, i) => a.trim() !== '' && skipped[i] !== true).length;
  const total = questionSet.questions.length;

  function formatAggregatedMessage(): string {
    const header = 'Here are my answers to your questions:\n\n';
    const body = questionSet.questions
      .map((q, i) => {
        const answer =
          skipped[i] === true || answers[i]?.trim() === '' ? '(no answer provided)' : answers[i];
        return `${String(q.index)}. **${q.title}** — ${q.body}\n   **Answer:** ${answer ?? '(no answer provided)'}`;
      })
      .join('\n\n');
    return header + body;
  }

  return (
    <div data-testid="question-review" className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-subtitle text-text-on-dark" role="heading">
          Your Answers
        </h2>
        <span className="text-caption text-text-muted-on-dark">
          {String(answeredCount)} of {String(total)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {questionSet.questions.map((question, i) => (
          <div
            key={question.index}
            data-testid="review-answer-row"
            className="flex items-start justify-between gap-2 rounded-lg bg-stage-bg p-3"
          >
            <div className="flex-1">
              <p className="text-small font-semibold text-text-on-dark">
                {String(question.index)}. {question.title}
              </p>
              {skipped[i] === true || answers[i]?.trim() === '' ? (
                <p className="text-caption text-text-muted-on-dark italic">Skipped</p>
              ) : (
                <p className="text-caption text-text-muted-on-dark line-clamp-2">{answers[i]}</p>
              )}
            </div>
            <button
              type="button"
              data-testid="review-edit"
              aria-label={`Edit answer for question ${String(question.index)}`}
              onClick={() => {
                onEdit(i);
              }}
              className="shrink-0 rounded-md p-1 text-text-muted-on-dark hover:text-text-on-dark"
            >
              ✎
            </button>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          aria-label="Edit answers"
          onClick={() => {
            onEdit(0);
          }}
          className="flex-1 rounded-lg border border-text-muted-on-dark px-4 py-2 text-small font-medium text-text-on-dark transition-colors hover:border-primary"
        >
          ← Edit
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm(formatAggregatedMessage());
          }}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-small font-medium text-stage-bg transition-colors hover:bg-primary-dark"
        >
          Send to {avatarName}
        </button>
      </div>
    </div>
  );
}
