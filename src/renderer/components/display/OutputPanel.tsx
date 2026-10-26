import type { ReactElement } from 'react';
import type { DisplayMode } from '../../hooks/useDisplayMode';
import { ActivityFeed, type FeedEntry } from './ActivityFeed';
import { ClusteredCards, type CardCluster } from './ClusteredCards';
import { ComparisonTable, type ComparisonRow } from './ComparisonTable';
import { DocumentView } from './DocumentView';
import { PlanPreview, type PlanStep as PreviewPlanStep } from './PlanPreview';
import { TaskProgress, type TaskStep } from './TaskProgress';

interface OutputPanelProps {
  mode: DisplayMode;
  data: unknown;
  onClose: () => void;
}

export function normalizeComparisonData(data: unknown): {
  rows: ComparisonRow[];
  criteria: string[];
} {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (Array.isArray(record['criteria']) && Array.isArray(record['rows'])) {
    return {
      rows: record['rows'] as ComparisonRow[],
      criteria: record['criteria'] as string[],
    };
  }
  const headers = Array.isArray(record['headers']) ? (record['headers'] as string[]) : [];
  const rawRows = Array.isArray(record['rows']) ? (record['rows'] as string[][]) : [];
  const criteria = headers.slice(1);
  const rows: ComparisonRow[] = rawRows.map((cells) => {
    const name = cells[0] ?? '';
    const scores: Record<string, number> = {};
    const detailsParts: string[] = [];
    criteria.forEach((criterion, idx) => {
      const cell = cells[idx + 1] ?? '';
      const parsedNum = Number.parseFloat(cell);
      scores[criterion] = Number.isFinite(parsedNum) ? Math.min(5, Math.max(1, parsedNum)) : 3;
      if (cell !== '') {
        detailsParts.push(`${criterion}: ${cell}`);
      }
    });
    return {
      name,
      scores,
      ...(detailsParts.length > 0 ? { details: detailsParts.join(' · ') } : {}),
    };
  });
  return { rows, criteria };
}

export function normalizeClusteredData(data: unknown): { clusters: CardCluster[] } {
  if (Array.isArray(data)) {
    return {
      clusters: (data as Array<{ heading: string; items: string[] }>).map((group) => ({
        category: group.heading,
        ideas: group.items.map((item) => ({ title: item })),
      })),
    };
  }
  const clusters =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { clusters?: unknown }).clusters)
      ? (data as { clusters: CardCluster[] }).clusters
      : [];
  return { clusters };
}

export function normalizePlanData(data: unknown): {
  steps: PreviewPlanStep[];
  approach: string;
} {
  if (Array.isArray(data)) {
    return {
      approach: 'Proposed implementation steps',
      steps: (data as Array<{ title: string; description: string; done: boolean }>).map(
        (step, idx) => ({
          number: idx + 1,
          description: step.title,
          estimatedScope:
            step.description !== '' ? step.description : step.done ? 'Completed' : 'Planned',
        }),
      ),
    };
  }
  const obj = (typeof data === 'object' && data !== null ? data : {}) as {
    steps?: PreviewPlanStep[];
    approach?: string;
  };
  return {
    approach: obj.approach ?? 'Proposed implementation steps',
    steps: Array.isArray(obj.steps) ? obj.steps : [],
  };
}

function getPanelTitle(mode: DisplayMode): string {
  if (mode === 'task-progress') return 'Progress';
  if (mode === 'document') return 'Document';
  if (mode === 'comparison-table') return 'Comparison';
  if (mode === 'clustered-cards') return 'Ideas';
  if (mode === 'activity-feed') return 'Activity';
  return 'Preview';
}

export function OutputPanel({ mode, data, onClose }: OutputPanelProps): ReactElement | null {
  if (mode === 'none') return null;

  return (
    <div className="flex h-full w-[380px] flex-col bg-surface-muted">
      <div className="flex items-center justify-between border-b border-stage-bg p-3">
        <h2 className="text-subtitle text-text-on-dark">{getPanelTitle(mode)}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-text-muted-on-dark hover:text-text-on-dark"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {mode === 'task-progress' && data != null && (
          <TaskProgress
            steps={(data as { steps: TaskStep[] }).steps}
            {...((data as { counters?: Record<string, number> }).counters !== undefined
              ? { counters: (data as { counters: Record<string, number> }).counters }
              : {})}
          />
        )}
        {mode === 'plan-preview' && data != null && (
          <PlanPreview
            steps={normalizePlanData(data).steps}
            approach={normalizePlanData(data).approach}
          />
        )}
        {mode === 'document' && data != null && (
          <DocumentView
            markdown={(data as { markdown: string }).markdown}
            {...((data as { filePath?: string }).filePath !== undefined
              ? { filePath: (data as { filePath: string }).filePath }
              : {})}
          />
        )}
        {mode === 'comparison-table' && data != null && (
          <ComparisonTable
            rows={normalizeComparisonData(data).rows}
            criteria={normalizeComparisonData(data).criteria}
          />
        )}
        {mode === 'clustered-cards' && data != null && (
          <ClusteredCards clusters={normalizeClusteredData(data).clusters} />
        )}
        {mode === 'activity-feed' && data != null && (
          <ActivityFeed entries={(data as { entries: FeedEntry[] }).entries} visible={true} />
        )}
      </div>
    </div>
  );
}
