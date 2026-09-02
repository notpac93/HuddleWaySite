import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
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
import { BackendApiError } from '../../src/lib/api/BackendApi';
import CreateTeamForm from '../../src/components/crm/teams/CreateTeamForm.svelte';

const TestedCreateTeamForm = CreateTeamForm as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function fillCreateForm({
  name = '  Falcons  ',
  description = '  12U travel team  ',
} = {}) {
  await fireEvent.input(screen.getByLabelText('Team Name *'), {
    target: { value: name },
  });
  await fireEvent.input(screen.getByLabelText('Description'), {
    target: { value: description },
  });
}

describe('CreateTeamForm guarded mutation states', () => {
  beforeEach(() => {
    backendMocks.createTeam.mockReset();
    backendMocks.updateTeam.mockReset();
    tenants.set('tenant-a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a normalized create once and locks every close/edit control in flight', async () => {
    const pending = deferred<void>();
    backendMocks.createTeam.mockReturnValue(pending.promise);
    render(TestedCreateTeamForm, {
      parentTeam: { id: 'boys', name: 'Boys' },
    });
    await fillCreateForm();

    const submit = screen.getByRole('button', { name: 'Create Team' });
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendMocks.createTeam).toHaveBeenCalledTimes(1);
    expect(backendMocks.createTeam).toHaveBeenCalledWith(
      'tenant-a',
      {
        name: 'Falcons',
        description: '12U travel team',
        parentTeamId: 'boys',
      },
      'Sub-team created under Boys.',
      expect.stringContaining('team-create:'),
    );
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel team form' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Team Name *')).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByText(/created under/i)).toHaveTextContent('Boys');

    pending.resolve();
    expect(
      await screen.findByRole('button', { name: 'Created!' }),
    ).toBeDisabled();
  });

  it('masks backend detail, reuses an unchanged retry key, and rotates after edits', async () => {
    backendMocks.createTeam
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw internal team error',
          status: 503,
          code: 'team_create_failed',
          requestId: 'request-team-8',
        }),
      )
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'second raw failure',
          status: 503,
          code: 'team_create_failed',
          requestId: 'request-team-9',
        }),
      )
      .mockResolvedValueOnce(undefined);
    render(TestedCreateTeamForm);
    await fillCreateForm();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Team' }),
    );
    const firstAlert = await screen.findByRole('alert');
    expect(firstAlert).toHaveTextContent('The team could not be saved.');
    expect(firstAlert).not.toHaveTextContent('request-team-8');
    expect(firstAlert).not.toHaveTextContent('raw internal team error');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry Create' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: 'Retry Create',
      })).toBeEnabled();
    });
    expect(backendMocks.createTeam).toHaveBeenCalledTimes(2);
    expect(backendMocks.createTeam.mock.calls[1][3])
      .toBe(backendMocks.createTeam.mock.calls[0][3]);

    await fireEvent.input(screen.getByLabelText('Description'), {
      target: { value: 'Corrected age group' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: 'Create Team',
      })).toBeEnabled();
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Team' }),
    );
    expect(backendMocks.createTeam).toHaveBeenCalledTimes(3);
    expect(backendMocks.createTeam.mock.calls[2][3])
      .not.toBe(backendMocks.createTeam.mock.calls[1][3]);
    expect(
      await screen.findByRole('button', { name: 'Created!' }),
    ).toBeDisabled();
  });

  it('uses the update contract and refuses to write without an active tenant', async () => {
    backendMocks.updateTeam.mockResolvedValue(undefined);
    const view = render(TestedCreateTeamForm, {
      team: {
        id: 'team-1',
        name: 'Falcons',
        description: 'Original description',
      },
    });
    await fireEvent.input(screen.getByLabelText('Description'), {
      target: { value: ' Updated description ' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save Team' }),
    );

    expect(backendMocks.updateTeam).toHaveBeenCalledWith(
      'tenant-a',
      'team-1',
      {
        name: 'Falcons',
        description: 'Updated description',
        parentTeamId: null,
      },
      'Team details updated from Teams & Divisions.',
      expect.stringContaining('team-update:'),
    );
    expect(backendMocks.createTeam).not.toHaveBeenCalled();

    view.unmount();
    tenants.set(null);
    render(TestedCreateTeamForm);
    await fillCreateForm({ name: 'Owls' });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Team' }),
    );
    expect(
      await screen.findByText(
        'Select an organization before saving a team.',
      ),
    ).toBeVisible();
    expect(backendMocks.createTeam).not.toHaveBeenCalled();
  });

  it('invalidates an in-flight response when the organization changes', async () => {
    const pending = deferred<void>();
    backendMocks.createTeam.mockReturnValue(pending.promise);
    render(TestedCreateTeamForm);
    await fillCreateForm();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Team' }),
    );

    await act(async () => {
      tenants.set('tenant-b');
      pending.resolve();
      await pending.promise;
    });

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      'The organization or team details changed while saving.',
    );
    expect(
      screen.getByRole('button', { name: 'Retry Create' }),
    ).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Created!' })).toBeNull();
  });
});
