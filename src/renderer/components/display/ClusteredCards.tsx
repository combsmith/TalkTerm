import { useState, type ReactElement } from 'react';

export interface IdeaCard {
  title: string;
  priority?: 'high' | 'medium' | 'low';
}
export interface CardCluster {
  category: string;
  ideas: IdeaCard[];
}
interface ClusteredCardsProps {
  clusters: CardCluster[];
}

export function ClusteredCards({ clusters }: ClusteredCardsProps): ReactElement {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (cat: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4">
      {clusters.map((cluster) => (
        <div key={cluster.category} className="rounded-lg bg-surface-muted p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => {
              toggle(cluster.category);
            }}
          >
            <span className="text-body font-semibold text-text-on-dark">{cluster.category}</span>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-caption text-primary">
              {String(cluster.ideas.length)}
            </span>
          </button>
          {expanded.has(cluster.category) && (
            <div className="mt-2 flex flex-col gap-2">
              {cluster.ideas.map((idea) => (
                <div key={idea.title} className="rounded-md bg-stage-bg p-2">
                  <span className="text-small text-text-on-dark">{idea.title}</span>
                  {idea.priority !== undefined && (
                    <span
                      className={`ml-2 text-caption ${idea.priority === 'high' ? 'text-danger' : idea.priority === 'medium' ? 'text-primary' : 'text-text-muted-on-dark'}`}
                    >
                      {idea.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
