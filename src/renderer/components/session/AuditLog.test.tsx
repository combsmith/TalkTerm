// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import type { AuditEntry } from '../../../shared/types/domain/audit-entry';
import { AuditLog } from './AuditLog';

const entries: AuditEntry[] = [
  {
    sessionId: 's1',
    timestamp: '12:00:01',
    actionType: 'tool:bash',
    outcome: 'success',
    userIntent: 'run tests',
    details: {},
  },
  {
    sessionId: 's1',
    timestamp: '12:00:02',
    actionType: 'tool:edit',
    outcome: 'failure',
    userIntent: 'edit file',
    details: {},
  },
];

describe('AuditLog', () => {
  it('renders all entries', () => {
    render(<AuditLog entries={entries} />);
    expect(screen.getByText('run tests')).toBeInTheDocument();
    expect(screen.getByText('edit file')).toBeInTheDocument();
  });

  it('shows filter buttons', () => {
    render(<AuditLog entries={entries} />);
    expect(screen.getByRole('button', { name: 'all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'success' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'failure' })).toBeInTheDocument();
  });

  it('filters by outcome', async () => {
    const user = userEvent.setup();
    render(<AuditLog entries={entries} />);
    await user.click(screen.getByRole('button', { name: 'failure' }));
    expect(screen.getByText('edit file')).toBeInTheDocument();
    expect(screen.queryByText('run tests')).not.toBeInTheDocument();
  });

  it('renders entries with cancelled outcome using muted style', () => {
    const cancelledEntry: AuditEntry = {
      sessionId: 's1',
      timestamp: '12:00:03',
      actionType: 'tool:read',
      outcome: 'cancelled',
      userIntent: 'read config',
      details: {},
    };
    render(<AuditLog entries={[cancelledEntry]} />);
    expect(screen.getByText('read config')).toBeInTheDocument();
  });
});
