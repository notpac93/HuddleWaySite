import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  importRosterParticipants: vi.fn(),
  previewRosterChanges: vi.fn(),
  commitRosterChanges: vi.fn(),
  assignSeasonParticipants: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import RosterParticipantEntry from '../../src/components/crm/roster/RosterParticipantEntry.svelte';

const TestedEntry = RosterParticipantEntry as unknown as Component;

describe('Roster participant entry', () => {
  beforeEach(() => {
    Object.values(backendMocks).forEach((mock) => mock.mockReset());
    backendMocks.importRosterParticipants.mockResolvedValue({
      tenantId: 'tenant-a',
      batchId: 'batch-a',
      savedCount: 1,
      registrationIds: ['registration-new'],
      idempotentReplay: false,
      requestId: 'request-import',
    });
    backendMocks.previewRosterChanges.mockResolvedValue({
      teamId: 'team-a',
      changes: [{ registrationId: 'registration-new', action: 'add' }],
      rows: [{ registrationId: 'registration-new', noOp: false }],
      changeSetHash: 'a'.repeat(64),
      addCount: 1,
      removeCount: 0,
      noOpCount: 0,
    });
    backendMocks.commitRosterChanges.mockResolvedValue({ success: true });
    backendMocks.assignSeasonParticipants.mockResolvedValue({
      success: true,
      assignedCount: 1,
    });
  });

  it('creates a program member and applies selected team and season assignments', async () => {
    render(TestedEntry, {
      tenantId: 'tenant-a',
      teams: [{ id: 'team-a', name: 'Boys Team' }],
      seasons: [{ id: 'season-a', name: 'Fall Season', status: 'active' }],
    });

    await fireEvent.input(screen.getByLabelText(/Person name/), {
      target: { value: 'Jordan Player' },
    });
    await fireEvent.input(screen.getByLabelText(/Email address/), {
      target: { value: 'guardian@example.test' },
    });
    await fireEvent.click(screen.getByLabelText('Boys Team'));
    await fireEvent.click(screen.getByLabelText('Fall Season'));
    await fireEvent.click(screen.getByRole('button', { name: 'Add person' }));

    await waitFor(() => expect(backendMocks.importRosterParticipants).toHaveBeenCalledTimes(1));
    expect(backendMocks.importRosterParticipants).toHaveBeenCalledWith(
      'tenant-a',
      [{
        rowNumber: 2,
        formData: expect.objectContaining({
          player_name: 'Jordan Player',
          parent_email: 'guardian@example.test',
        }),
      }],
      expect.stringContaining('crm-roster-participant-import:'),
    );
    expect(backendMocks.previewRosterChanges).toHaveBeenCalledWith(
      'tenant-a',
      'team-a',
      [{ registrationId: 'registration-new', action: 'add' }],
    );
    expect(backendMocks.commitRosterChanges).toHaveBeenCalledTimes(1);
    expect(backendMocks.assignSeasonParticipants).toHaveBeenCalledWith(
      'tenant-a',
      'season-a',
      ['registration-new'],
      expect.stringContaining(':season:season-a'),
    );
  });

  it('does not submit an invalid email', async () => {
    render(TestedEntry, { tenantId: 'tenant-a' });
    await fireEvent.input(screen.getByLabelText(/Person name/), {
      target: { value: 'Jordan Player' },
    });
    await fireEvent.input(screen.getByLabelText(/Email address/), {
      target: { value: 'not-an-email' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid email');
    expect(backendMocks.importRosterParticipants).not.toHaveBeenCalled();
  });
});
