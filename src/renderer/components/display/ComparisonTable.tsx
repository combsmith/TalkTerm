import { useState, type ReactElement } from 'react';

export interface ComparisonRow {
  name: string;
  scores: Record<string, number>;
  values?: Record<string, string>;
  details?: string;
  isWinner?: boolean;
}
interface ComparisonTableProps {
  rows: ComparisonRow[];
  criteria: string[];
}

function scoreColor(score: number): string {
  if (score >= 4) return 'bg-semantic-success';
  if (score >= 3) return 'bg-primary';
  return 'bg-danger';
}

export function ComparisonTable({ rows, criteria }: ComparisonTableProps): ReactElement {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 overflow-y-auto p-4">
      {rows.map((row) => (
        <div
          key={row.name}
          className={`rounded-lg border-2 p-3 ${row.isWinner === true ? 'border-primary' : 'border-surface-muted'}`}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => {
              setExpanded(expanded === row.name ? null : row.name);
            }}
          >
            <span className="text-body font-semibold text-text-on-dark">{row.name}</span>
            <span className="text-caption text-text-muted-on-dark">
              {expanded === row.name ? '▲' : '▼'}
            </span>
          </button>
          <div className="mt-2 flex gap-2">
            {criteria.map((c) => {
              const rawValue = row.values?.[c];
              const hasScore = Object.prototype.hasOwnProperty.call(row.scores, c);
              const score = row.scores[c] ?? 0;
              return (
                <div key={c} className="flex flex-1 flex-col gap-1">
                  <span className="text-caption text-text-muted-on-dark">{c}</span>
                  {hasScore || rawValue === undefined ? (
                    <div className="h-2 rounded-full bg-surface-muted">
                      <div
                        className={`h-full rounded-full ${scoreColor(score)}`}
                        style={{ width: `${String(score * 20)}%` }}
                      />
                    </div>
                  ) : (
                    <span className="text-small text-text-on-dark">{rawValue}</span>
                  )}
                </div>
              );
            })}
          </div>
          {expanded === row.name && row.details !== undefined && (
            <p className="mt-3 text-small text-text-muted-on-dark">{row.details}</p>
          )}
        </div>
      ))}
    </div>
  );
}
