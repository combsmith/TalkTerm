import { useState, type ReactElement } from 'react';
import type { AuditEntry } from '../../../shared/types/domain/audit-entry';

interface AuditLogProps {
  entries: AuditEntry[];
}

export function AuditLog({ entries }: AuditLogProps): ReactElement {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.outcome === filter);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        {['all', 'success', 'failure', 'cancelled'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFilter(f);
            }}
            className={`rounded-full px-3 py-1 text-caption transition-colors ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-surface-muted text-text-muted-on-dark hover:text-text-on-dark'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {filtered.map((entry) => (
          <div
            key={`${entry.timestamp}-${entry.actionType}`}
            className="flex items-center gap-2 rounded-md bg-surface-muted p-2"
          >
            <span className="shrink-0 text-caption text-text-muted-on-dark">{entry.timestamp}</span>
            <span className="shrink-0 font-mono text-caption text-primary">{entry.actionType}</span>
            <span
              className={`text-caption ${
                entry.outcome === 'success'
                  ? 'text-semantic-success'
                  : entry.outcome === 'failure'
                    ? 'text-danger'
                    : 'text-text-muted-on-dark'
              }`}
            >
              {entry.outcome}
            </span>
            <span className="flex-1 truncate text-caption text-text-on-dark">
              {entry.userIntent}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
