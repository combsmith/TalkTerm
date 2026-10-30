import type { ReactElement } from 'react';

export interface FeedEntry {
  timestamp: string;
  actionType: string;
  description: string;
}
interface ActivityFeedProps {
  entries: FeedEntry[];
  visible: boolean;
}

export function ActivityFeed({ entries, visible }: ActivityFeedProps): ReactElement | null {
  if (!visible) return null;
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-stage-bg p-4 font-mono text-caption">
      {entries.map((entry, i) => (
        <div key={`${entry.timestamp}-${String(i)}`} className="flex gap-2 py-0.5">
          <span className="shrink-0 text-text-muted-on-dark">{entry.timestamp}</span>
          <span className="shrink-0 text-primary">[{entry.actionType}]</span>
          <span className="text-text-on-dark">{entry.description}</span>
        </div>
      ))}
    </div>
  );
}
