import type { ReactElement } from 'react';

export interface PlanStep {
  number: number;
  description: string;
  estimatedScope: string;
}

interface PlanPreviewProps {
  steps: PlanStep[];
  approach: string;
}

export function PlanPreview({ steps, approach }: PlanPreviewProps): ReactElement {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg bg-stage-bg p-3">
        <h3 className="text-subtitle text-text-on-dark">Approach</h3>
        <p className="mt-1 text-body text-text-muted-on-dark">{approach}</p>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-3 rounded-lg bg-stage-bg p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-white">
              {String(step.number)}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-body text-text-on-dark">{step.description}</span>
              <span className="text-caption text-text-muted-on-dark">{step.estimatedScope}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
