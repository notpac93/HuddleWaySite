import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
  },
}));

vi.mock('../../src/lib/services/RosterService', () => ({
  RosterService: {
    subscribeToPlayers: vi.fn((_tenantId, _activeTeam, callback) => {
      callback(
        [{ id: 'registration-1', teamId: null, teamIds: [], team: 'Falcons' }],
        {
          truncated: {
            registrations: false,
            privateRegistrations: true,
            memberships: false,
            teams: false,
          },
          requestId: 'roster-request',
        },
      );
      return () => {};
    }),
  },
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    refreshOperationalCollections: vi.fn(),
    teamsStore: writable([]),
    registrationsStore: writable([]),
    registrationsProjectionScope: writable({
      limit: null,
      truncated: false,
      loading: false,
      error: '',
      permissionDenied: false,
    }),
    seasonsStore: writable([]),
    eventsStore: writable([]),
    teamsProjectionScope: writable({
      limit: null,
      truncated: false,
      loading: false,
      error: '',
      permissionDenied: false,
    }),
  };
});

import {
  eventsStore,
  seasonsStore,
  teamsProjectionScope,
  teamsStore,
} from '../../src/lib/services/DataStore';
import TeamsManager from '../../src/components/crm/TeamsManager.svelte';
import { backendClient } from '../../src/lib/api/backendClient';

const TestedTeamsManager = TeamsManager as unknown as Component;
const teams = teamsStore as Writable<Array<Record<string, unknown>>>;
const events = eventsStore as Writable<Array<Record<string, unknown>>>;
const seasons = seasonsStore as Writable<Array<Record<string, unknown>>>;
const scope = teamsProjectionScope as Writable<{
  limit: number | null;
  truncated: boolean;
  loading: boolean;
  error: string;
  permissionDenied: boolean;
}>;

const healthyScope = {
  limit: null,
  truncated: false,
  loading: false,
  error: '',
  permissionDenied: false,
};

describe('TeamsManager complete projection states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teams.set([]);
    events.set([]);
    seasons.set([]);
    scope.set({ ...healthyScope });
  });

  it('renders loading, safe failure, empty, and create-modal states', async () => {
    scope.set({ ...healthyScope, loading: true });
    render(TestedTeamsManager);
    expect(screen.getByRole('status')).toHaveTextContent('Loading teams');

    scope.set({
      ...healthyScope,
      error: 'You do not have permission to view teams.',
      permissionDenied: true,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to view teams.',
    );

    scope.set({ ...healthyScope });
    expect(await screen.findByText('No teams yet')).toBeVisible();

    await fireEvent.click(
      screen.getAllByRole('button', { name: 'Create team' })[0],
    );
    expect(
      screen.getByRole('dialog', { name: 'Create New Team' }),
    ).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Create New Team' }),
      ).toBeNull();
    });
  });

  it('opens stable-ID rows and consumes a search target exactly once', async () => {
    const setActiveTeam = vi.fn();
    const onTargetConsumed = vi.fn();
    teams.set([
      {
        id: 'team-1',
        name: 'Falcons',
        description: '12U program',
      },
      {
        id: 'team-2',
        name: 'Owls',
        description: '',
      },
    ]);
    render(TestedTeamsManager, {
      activeResultId: 'team-2',
      setActiveTeam,
      onTargetConsumed,
    });

    expect(screen.getByRole('button', { name: /Falcons.*1 people/ })).toBeVisible();

    await waitFor(() => {
      expect(onTargetConsumed).toHaveBeenCalledTimes(1);
      expect(onTargetConsumed).toHaveBeenCalledWith('team-2');
      expect(setActiveTeam).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'team-2', name: 'Owls' }),
      );
    });

    await fireEvent.click(
      screen.getByRole('button', { name: /Falcons.*Open team/ }),
    );
    expect(setActiveTeam).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'team-1', name: 'Falcons' }),
    );

    teams.set([
      {
        id: 'team-2',
        name: 'Owls',
        description: '',
      },
    ]);
    await waitFor(() => {
      expect(onTargetConsumed).toHaveBeenCalledTimes(1);
    });
  });

  it('requires confirmation and deletes a team through the protected backend', async () => {
    vi.mocked(backendClient.deleteTeam).mockResolvedValue({
      success: true,
      id: 'team-1',
      deleted: true,
      idempotentReplay: false,
      operationId: 'delete-operation',
      requestId: 'delete-request',
    });
    teams.set([
      { id: 'team-1', name: 'Falcons', description: '12U program' },
    ]);
    render(TestedTeamsManager, {
      activeTeam: { id: 'team-1', name: 'Falcons', description: '12U program' },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Delete team' }));
    expect(screen.getByText(/1 roster record/)).toBeVisible();
    expect(
      screen.getByRole('dialog', { name: 'Delete Falcons?' }),
    ).toBeVisible();

    const deleteButton = screen.getByRole('button', { name: 'Permanently delete team' });
    expect(deleteButton).toBeDisabled();
    await fireEvent.input(screen.getByLabelText('Audit reason'), {
      target: { value: 'The program has been retired.' },
    });
    await fireEvent.input(screen.getByLabelText('Type Falcons to confirm'), {
      target: { value: 'Falcons' },
    });
    expect(deleteButton).toBeEnabled();
    await fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(backendClient.deleteTeam).toHaveBeenCalledWith(
        'tenant-a',
        'team-1',
        'The program has been retired.',
        expect.stringMatching(/^team-delete:/),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete Falcons?' })).toBeNull();
    });
  });

  it('joins future events and seasons through the validated team reference', async () => {
    const team = { id: 'tenant-a_esports', referenceId: 'esports', name: 'Esports' };
    teams.set([team]);
    seasons.set([{ id: 'season-1', teamId: 'esports', name: 'Esports League', status: 'active' }]);
    events.set([
      { id: 'event-1', teamId: 'esports', startAt: '2099-10-21T19:00:00Z', status: 'published' },
      { id: 'event-2', teamId: 'tenant-a_esports', startAt: '2099-10-22T19:00:00Z', status: 'published' },
      { id: 'archived', teamId: 'esports', startAt: '2099-10-23T19:00:00Z', status: 'archived' },
      { id: 'past', teamId: 'esports', startAt: '2020-10-21T19:00:00Z', status: 'published' },
      { id: 'program', teamId: 'all', startAt: '2099-10-21T19:00:00Z', status: 'published' },
      { id: 'other', teamId: 'different-team', startAt: '2099-10-21T19:00:00Z', status: 'published' },
    ]);
    render(TestedTeamsManager, { activeTeam: team });
    expect(screen.getByRole('button', { name: 'Upcoming events 2' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Active season Esports League' })).toBeVisible();
    // Event registration is not an explicit roster membership.
    expect(screen.getByRole('button', { name: 'Roster 0 people' })).toBeVisible();
    events.update((events) => [...events, {
      id: 'refreshed-event', metadata: { teamId: 'esports' },
      startAt: '2099-11-01T19:00:00Z', status: 'published',
    }]);
    expect(await screen.findByRole('button', { name: 'Upcoming events 3' })).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(screen.getByRole('dialog', { name: 'Edit Team' })).toBeVisible();
  });

  it('does not join ambiguous aliases into a selected team overview', () => {
    const team = { id: 'team-1', referenceId: 'shared', name: 'One' };
    teams.set([team, { id: 'team-2', referenceId: 'shared', name: 'Two' }]);
    seasons.set([{ id: 'season-1', teamId: 'shared', name: 'Ambiguous season', status: 'active' }]);
    events.set([{ id: 'event-1', teamId: 'shared', startAt: '2099-10-21T19:00:00Z', status: 'published' }]);
    render(TestedTeamsManager, { activeTeam: team });
    expect(screen.getByRole('button', { name: 'Upcoming events 0' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Active season No season connected' })).toBeVisible();
  });

  it('refreshes loaded event impact when a team alias becomes ambiguous', async () => {
    const team = { id: 'team-1', referenceId: 'shared', name: 'One' };
    teams.set([team]);
    events.set([{ id: 'event-1', teamId: 'shared', startAt: '2099-10-21T19:00:00Z', status: 'published' }]);
    render(TestedTeamsManager, { activeTeam: team });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete team' }));
    expect(screen.getByText(/and 1 event reference/)).toBeVisible();
    teams.set([team, { id: 'team-2', referenceId: 'shared', name: 'Two' }]);
    expect(await screen.findByText(/and 0 events reference/)).toBeVisible();
    expect(backendClient.deleteTeam).not.toHaveBeenCalled();
  });
});
