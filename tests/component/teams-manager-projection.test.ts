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

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    teamsStore: writable([]),
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
  teamsProjectionScope,
  teamsStore,
} from '../../src/lib/services/DataStore';
import TeamsManager from '../../src/components/crm/TeamsManager.svelte';
import { backendClient } from '../../src/lib/api/backendClient';

const TestedTeamsManager = TeamsManager as unknown as Component;
const teams = teamsStore as Writable<Array<Record<string, unknown>>>;
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
    expect(await screen.findByText('No teams')).toBeVisible();

    await fireEvent.click(
      screen.getAllByRole('button', { name: 'Create Team' })[1],
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
    render(TestedTeamsManager);

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Falcons' }));
    expect(
      screen.getByRole('dialog', { name: 'Delete Falcons?' }),
    ).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Team' }));
    await waitFor(() => {
      expect(backendClient.deleteTeam).toHaveBeenCalledWith(
        'tenant-a',
        'team-1',
        'Delete Falcons and archive its linked team content.',
        expect.stringMatching(/^team-delete:/),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete Falcons?' })).toBeNull();
    });
  });
});
