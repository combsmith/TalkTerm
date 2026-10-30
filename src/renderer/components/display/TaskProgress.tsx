import type { ReactElement } from 'react';

export interface TaskStep {
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  elapsedMs?: number;
}
interface TaskProgressProps {
  steps: TaskStep[];
  counters?: Record<string, number>;
}

const statusIcons: Record<TaskStep['status'], string> = {
  completed: '✓',
  'in-progress': '●',
  pending: '○',
  failed: '✗',
};
const statusColors: Record<TaskStep['status'], string> = {
  completed: 'text-semantic-success',
  'in-progress': 'text-primary animate-pulse',
  pending: 'text-text-muted-on-dark',
  failed: 'text-danger',
};

/** Map raw SDK tool names (lowercase) to user-friendly labels */
const TOOL_LABELS: Record<string, string> = {
  bash: 'Running command',
  read: 'Reading file',
  write: 'Writing file',
  edit: 'Editing file',
  glob: 'Searching files',
  grep: 'Searching content',
  skill: 'Running skill',
  agent: 'Running sub-agent',
  webfetch: 'Fetching web page',
  websearch: 'Searching the web',
  notebookedit: 'Editing notebook',
  taskcreate: 'Creating task',
  taskupdate: 'Updating task',
};

export function friendlyToolName(rawName: string): string {
  return TOOL_LABELS[rawName.toLowerCase()] ?? rawName;
}

export function TaskProgress({ steps, counters }: TaskProgressProps): ReactElement {
  const completed = steps.filter((s) => s.status === 'completed').length;
  const pct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-2 w-full rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.name} className="flex items-center gap-2">
            <span className={`text-body ${statusColors[step.status]}`}>
              {statusIcons[step.status]}
            </span>
            <span className="flex-1 text-small text-text-on-dark">
              {friendlyToolName(step.name)}
            </span>
            {step.elapsedMs !== undefined && (
              <span className="text-caption text-text-muted-on-dark">
                {String(Math.round(step.elapsedMs / 1000))}s
              </span>
            )}
          </li>
        ))}
      </ul>
      {counters !== undefined && Object.keys(counters).length > 0 && (
        <div className="flex gap-4">
          {Object.entries(counters).map(([k, v]) => (
            <span key={k} className="text-small text-text-muted-on-dark">
              {String(v)} {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
