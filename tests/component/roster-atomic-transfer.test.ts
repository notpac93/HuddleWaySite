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

const backendMocks = vi.hoisted(() => ({
  previewRosterTransfer: vi.fn(),
  commitRosterTransfer: vi.fn(),
  assignSeasonParticipants: vi.fn(),
  previewRosterChanges: vi.fn(),
  commitRosterChanges: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import { tenantIdStore } from '../../src/lib/authStore';
import PlayerTable from '../../src/components/crm/roster/PlayerTable.svelte';

const TestedPlayerTable = PlayerTable as unknown as Component;

const players = [
  {
    id: 'registration-1',
    name: 'Kai Reed',
    email: 'kai@example.test',
    role: 'Player',
    team: 'Falcons',
    status: 'Active',
  },
];

const teams = [
  { id: 'team-1', name: 'Falcons' },
  { id: 'team-2', name: 'Owls' },
];

const transferPreview = {
  destinationTeamId: 'team-2',
  destinationTeamName: 'Owls',
  registrationIds: ['registration-1'],
  rows: [{
    registrationId: 'registration-1',
    label: 'Kai Reed',
    beforeTeamIds: ['team-1'],
    afterTeamIds: ['team-2'],
    addTeamIds: ['team-2'],
    removeTeamIds: ['team-1'],
    noOp: false,
  }],
  changes: [
    {
      registrationId: 'registration-1',
      membershipId: 'membership-1',
      teamId: 'team-1',
      action: 'remove',
    },
    {
      registrationId: 'registration-1',
      membershipId: 'membership-2',
      teamId: 'team-2',
      action: 'add',
    },
  ],
  changeSetHash: 'a'.repeat(64),
  affectedTeamIds: ['team-1', 'team-2'],
  registrationCount: 1,
  addCount: 1,
  removeCount: 1,
  noOpCount: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function prepareTransfer() {
  render(TestedPlayerTable, {
    players,
    allTeams: teams,
  });
  await fireEvent.click(screen.getAllByLabelText('Select Kai Reed')[0]);
  await fireEvent.change(
    screen.getByLabelText('Bulk roster action'),
    { target: { value: 'assign_team' } },
  );
  await fireEvent.change(
    screen.getByLabelText('Destination team'),
    { target: { value: 'team-2' } },
  );
}

describe('PlayerTable atomic roster transfer', () => {
  beforeEach(() => {
    backendMocks.previewRosterTransfer.mockReset();
    backendMocks.commitRosterTransfer.mockReset();
    backendMocks.assignSeasonParticipants.mockReset();
    backendMocks.previewRosterChanges.mockReset();
    backendMocks.commitRosterChanges.mockReset();
    (tenantIdStore as Writable<string>).set('tenant-a');
  });

  it('uses one reviewed preview and one atomic commit for a multi-team move', async () => {
    backendMocks.previewRosterTransfer.mockResolvedValue(transferPreview);
    backendMocks.commitRosterTransfer.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      tenantId: 'tenant-a',
      operationId: 'operation-1',
      auditEventId: 'audit-1',
      preview: transferPreview,
      requestId: 'request-1',
    });
    await prepareTransfer();

    const review = screen.getByRole('button', { name: 'Review change' });
    await fireEvent.click(review);

    expect(backendMocks.commitRosterTransfer).not.toHaveBeenCalled();
    expect(await screen.findByText('Nothing has changed yet. Confirm only after checking this impact.')).toBeVisible();
    const confirm = screen.getByRole('button', { name: 'Confirm roster change' });
    await fireEvent.click(confirm);
    await fireEvent.click(confirm);

    await waitFor(() => {
      expect(backendMocks.commitRosterTransfer).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.previewRosterTransfer).toHaveBeenCalledWith(
      'tenant-a',
      ['registration-1'],
      'team-2',
    );
    expect(backendMocks.commitRosterTransfer).toHaveBeenCalledWith(
      'tenant-a',
      transferPreview,
      expect.stringContaining('roster-atomic-transfer:'),
    );
    expect(backendMocks.previewRosterChanges).not.toHaveBeenCalled();
    expect(backendMocks.commitRosterChanges).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        'Roster transfer complete: 1 added, 1 removed, and 0 unchanged.',
      ),
    ).toBeVisible();
  });

  it('offers seasons globally and connects selected registrations to a season', async () => {
    backendMocks.assignSeasonParticipants.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      tenantId: 'tenant-a',
      seasonId: 'season-fall',
      registrationIds: ['registration-1'],
      assignedCount: 1,
      alreadyAssignedCount: 0,
      operationId: 'operation-season-1',
      auditEventId: 'audit-season-1',
      requestId: 'request-season-1',
    });
    render(TestedPlayerTable, {
      players,
      allTeams: teams,
      allSeasons: [{ id: 'season-fall', name: 'Fall 2026' }],
    });
    await fireEvent.click(screen.getAllByLabelText('Select Kai Reed')[0]);
    const action = screen.getByLabelText('Bulk roster action');
    await fireEvent.change(action, {
      target: { value: 'assign_season' },
    });
    const destination = screen.getByLabelText('Destination season');
    expect(destination).toHaveTextContent('Fall 2026');
    await fireEvent.change(destination, {
      target: { value: 'season-fall' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(backendMocks.assignSeasonParticipants).not.toHaveBeenCalled();
    expect(await screen.findByText(
      'Connect 1 registration to season Fall 2026.',
    )).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm roster change' }));

    await waitFor(() => {
      expect(backendMocks.assignSeasonParticipants).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.assignSeasonParticipants).toHaveBeenCalledWith(
      'tenant-a',
      'season-fall',
      ['registration-1'],
      expect.stringContaining('season-participant-assignment:'),
    );
    expect(backendMocks.previewRosterTransfer).not.toHaveBeenCalled();
    expect(backendMocks.commitRosterTransfer).not.toHaveBeenCalled();
    expect(await screen.findByText(
      'Season assignment complete: 1 assigned and 0 already connected.',
    )).toBeVisible();
  });

  it('does not commit a preview that resolves after the tenant changes', async () => {
    const pendingPreview = deferred<typeof transferPreview>();
    backendMocks.previewRosterTransfer.mockReturnValue(pendingPreview.promise);
    await prepareTransfer();

    await fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(backendMocks.previewRosterTransfer).toHaveBeenCalledTimes(1);
    await act(async () => {
      (tenantIdStore as Writable<string>).set('tenant-b');
      pendingPreview.resolve(transferPreview);
      await pendingPreview.promise;
    });

    await waitFor(() => {
      expect(backendMocks.commitRosterTransfer).not.toHaveBeenCalled();
    });
  });

  it('explains participant identity blockers and shows a support reference', async () => {
    const { BackendApiError } = await import(
      '../../src/lib/api/BackendApi'
    );
    backendMocks.previewRosterTransfer.mockRejectedValue(new BackendApiError({
      message: 'safe participant identity blocker',
      status: 409,
      code: 'participant_team_assignment_identity_required',
      requestId: 'request-preview-identity-1',
    }));
    await prepareTransfer();

    await fireEvent.click(screen.getByRole('button', { name: 'Review change' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'needs participant identity repair',
    );
    expect(screen.getByText(
      /contact support with reference request-preview-identity-1/,
    )).toBeVisible();
    expect(backendMocks.commitRosterTransfer).not.toHaveBeenCalled();
  });

  it('masks commit failures and reuses the same operation key on retry', async () => {
    const { BackendApiError } = await import(
      '../../src/lib/api/BackendApi'
    );
    backendMocks.previewRosterTransfer.mockResolvedValue(transferPreview);
    backendMocks.commitRosterTransfer
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw database failure',
          status: 503,
          code: 'roster_transfer_failed',
          requestId: 'request-transfer-9',
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        idempotentReplay: true,
        tenantId: 'tenant-a',
        operationId: 'operation-1',
        auditEventId: 'audit-1',
        preview: transferPreview,
        requestId: 'request-2',
      });
    await prepareTransfer();

    await fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Confirm roster change' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The reviewed roster update could not be applied.');
    expect(alert).not.toHaveTextContent('raw database failure');
    expect(screen.getByText(/contact support with reference request-transfer-9/)).toBeVisible();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry confirmed change' }),
    );
    await screen.findByText(
      'Roster transfer complete: 1 added, 1 removed, and 0 unchanged.',
    );
    expect(backendMocks.commitRosterTransfer).toHaveBeenCalledTimes(2);
    expect(
      backendMocks.commitRosterTransfer.mock.calls[1][2],
    ).toBe(backendMocks.commitRosterTransfer.mock.calls[0][2]);
  });

  it('locks reviewed fields during commit and omits rows without stable IDs', async () => {
    backendMocks.previewRosterTransfer.mockResolvedValue(transferPreview);
    const pendingCommit = deferred<{
      success: boolean;
      idempotentReplay: boolean;
      tenantId: string;
      operationId: string;
      auditEventId: string;
      preview: typeof transferPreview;
      requestId: string;
    }>();
    backendMocks.commitRosterTransfer.mockReturnValue(pendingCommit.promise);

    render(TestedPlayerTable, {
      players: [
        ...players,
        { id: '', name: 'Unstable', role: 'Player', status: 'Active' },
      ],
      allTeams: teams,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 roster record was omitted',
    );
    await fireEvent.click(screen.getAllByLabelText('Select Kai Reed')[0]);
    const actionSelect = screen.getByLabelText('Bulk roster action');
    await fireEvent.change(actionSelect, { target: { value: 'assign_team' } });
    const teamSelect = screen.getByLabelText('Destination team');
    await fireEvent.change(teamSelect, { target: { value: 'team-2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Confirm roster change' }));

    expect(actionSelect).toBeDisabled();
    expect(teamSelect).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled();

    pendingCommit.resolve({
      success: true,
      idempotentReplay: false,
      tenantId: 'tenant-a',
      operationId: 'operation-1',
      auditEventId: 'audit-1',
      preview: transferPreview,
      requestId: 'request-1',
    });
    await screen.findByText(
      'Roster transfer complete: 1 added, 1 removed, and 0 unchanged.',
    );
  });
});
