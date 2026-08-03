import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rosterMocks = vi.hoisted(() => ({
  subscribeToPlayers: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    seasonsStore: writable([]),
    teamsStore: writable([]),
    teamsProjectionScope: writable({
      loading: false,
      error: '',
      truncated: false,
    }),
  };
});

vi.mock('../../src/lib/services/RosterService', () => ({
  RosterService: rosterMocks,
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    previewRosterTransfer: vi.fn(),
    commitRosterTransfer: vi.fn(),
    assignSeasonParticipants: vi.fn(),
    previewRosterChanges: vi.fn(),
    commitRosterChanges: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import {
  teamsProjectionScope,
  teamsStore,
} from '../../src/lib/services/DataStore';
import RosterManager from '../../src/components/crm/roster/RosterManager.svelte';
import TeamTable from '../../src/components/crm/roster/TeamTable.svelte';

const TestedRosterManager = RosterManager as unknown as Component;
const TestedTeamTable = TeamTable as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const projectedTeams = teamsStore as Writable<any[]>;
const teamScope = teamsProjectionScope as Writable<any>;

type PlayerCallback = (
  players: any[],
  scope: {
    truncated: {
      registrations: boolean;
      memberships: boolean;
      teams: boolean;
    };
    requestId: string;
  },
) => void;

describe('RosterManager projection and navigation controls', () => {
  let subscriptions: Array<{
    success: PlayerCallback;
    error: (error: unknown) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    subscriptions = [];
    tenants.set('tenant-a');
    projectedTeams.set([]);
    teamScope.set({ loading: false, error: '', truncated: false });
    rosterMocks.subscribeToPlayers.mockReset();
    rosterMocks.subscribeToPlayers.mockImplementation(
      (
        _tenantId: string,
        _activeTeam: unknown,
        success: PlayerCallback,
        error: (reason: unknown) => void,
      ) => {
        const unsubscribe = vi.fn();
        subscriptions.push({ success, error, unsubscribe });
        return unsubscribe;
      },
    );
  });

  it('keeps one current subscription and ignores a late prior-tenant result', async () => {
    render(TestedRosterManager);
    expect(rosterMocks.subscribeToPlayers).toHaveBeenCalledTimes(1);
    expect(rosterMocks.subscribeToPlayers).toHaveBeenLastCalledWith(
      'tenant-a',
      null,
      expect.any(Function),
      expect.any(Function),
    );

    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(rosterMocks.subscribeToPlayers).toHaveBeenCalledTimes(2);

    await act(async () => {
      subscriptions[0].success(
        [{
          id: 'registration-old',
          name: 'Prior Tenant',
          role: 'Player',
          status: 'Active',
        }],
        {
          truncated: {
            registrations: false,
            memberships: false,
            teams: false,
          },
          requestId: 'old-request',
        },
      );
      subscriptions[1].success(
        [{
          id: 'registration-new',
          name: 'Current Tenant',
          role: 'Player',
          status: 'Active',
        }],
        {
          truncated: {
            registrations: true,
            memberships: false,
            teams: false,
          },
          requestId: 'new-request',
        },
      );
    });

    expect(screen.queryAllByText('Prior Tenant')).toHaveLength(0);
    expect(screen.getAllByText('Current Tenant')[0]).toBeVisible();
    expect(screen.getByText(/limited projection/i)).toBeVisible();
  });

  it('shows safe correlated errors and wires every roster tab', async () => {
    projectedTeams.set([
      { id: 'child-1', name: 'Owls', parentTeamId: 'parent-1' },
      { id: 'other-1', name: 'Falcons', parentTeamId: 'other-parent' },
    ]);
    render(TestedRosterManager, {
      activeTeam: { id: 'parent-1' },
    });
    await act(async () => {
      subscriptions[0].error({
        message: 'raw provider detail',
        requestId: 'roster-load-7',
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Roster players could not be loaded.',
    );
    expect(screen.getByText('Support request: roster-load-7')).toBeVisible();
    expect(screen.queryByText('raw provider detail')).toBeNull();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Teams & Divisions' }),
    );
    expect(screen.getAllByText('Owls')[0]).toBeVisible();
    expect(screen.queryAllByText('Falcons')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Teams & Divisions' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(
      screen.getByRole('button', { name: 'CSV Import' }),
    );
    expect(screen.getByText('Import Roster Changes via CSV')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'CSV Import' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TeamTable row controls', () => {
  it('omits unstable rows and wires open, edit, create, and cancel controls', async () => {
    const setActiveTeam = vi.fn();
    render(TestedTeamTable, {
      parentTeam: { id: 'boys', name: 'Boys' },
      teams: [
        {
          id: 'team-1',
          name: 'Falcons',
          division: '',
          coach: '',
          memberCount: 9,
        },
        { id: '', name: 'Unstable team' },
      ],
      setActiveTeam,
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 team record was omitted',
    );
    expect(screen.getByText('Boys teams')).toBeVisible();
    expect(screen.getByText('9')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Open team' }));
    expect(setActiveTeam).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team-1', name: 'Falcons' }),
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Edit' }),
    );
    expect(screen.getByRole('heading', { name: 'Edit Team' })).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit Team' })).toBeNull();
    });

    await fireEvent.click(
      screen.getByRole('button', { name: '+ Create Team' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Create New Team' }),
    ).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Cancel team form' }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Create New Team' }),
      ).toBeNull();
    });
  });
});
