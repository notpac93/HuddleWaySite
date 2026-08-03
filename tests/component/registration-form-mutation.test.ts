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
  createRegistrationForm: vi.fn(),
  updateRegistrationForm: vi.fn(),
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
import CreateRegistrationForm from '../../src/components/crm/registration/CreateRegistrationForm.svelte';

const TestedCreateRegistrationForm =
  CreateRegistrationForm as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function reachBuilder({
  title = '  Fall 12U Registration  ',
  description = '  Fall program intake  ',
} = {}) {
  await fireEvent.input(screen.getByLabelText('Registration Title *'), {
    target: { value: title },
  });
  await fireEvent.input(screen.getByLabelText('Description'), {
    target: { value: description },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Save Form' })).toBeVisible();
}

describe('CreateRegistrationForm guarded mutation states', () => {
  beforeEach(() => {
    backendMocks.createRegistrationForm.mockReset();
    backendMocks.updateRegistrationForm.mockReset();
    tenants.set('tenant-a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits one normalized create and locks modal controls in flight', async () => {
    const pending = deferred<{ id: string }>();
    backendMocks.createRegistrationForm.mockReturnValue(pending.promise);
    render(TestedCreateRegistrationForm);
    await reachBuilder();

    const submit = screen.getByRole('button', { name: 'Save Form' });
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendMocks.createRegistrationForm).toHaveBeenCalledTimes(1);
    expect(backendMocks.createRegistrationForm).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        title: 'Fall 12U Registration',
        description: 'Fall program intake',
        fields: {
          collectParentNames: true,
          collectParentPhone: true,
          collectParentEmail: true,
          collectEmergencyContacts: false,
          collectDob: true,
          collectGender: false,
          collectShirtSize: false,
          collectMedicalInfo: false,
          collectExperience: false,
          collectCoachRequest: false,
          collectVolunteer: false,
        },
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: 'player_information',
            title: 'Player Information',
            fields: expect.arrayContaining([
              expect.objectContaining({ id: 'player_name', required: true }),
              expect.objectContaining({ id: 'player_dob', type: 'date' }),
            ]),
          }),
        ]),
        status: 'active',
      }),
      'Registration form created from CRM.',
      expect.stringMatching(/^registration-form-create:/),
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel registration form' }),
    ).toBeDisabled();
    expect(screen.getAllByLabelText('Question')[0]).toBeDisabled();
    expect(screen.queryByText('Reason for change')).not.toBeInTheDocument();

    pending.resolve({ id: 'registration-form-1' });
    expect(
      await screen.findByRole('button', { name: 'Saved!' }),
    ).toBeDisabled();
  });

  it('masks backend detail, preserves an unchanged retry key, and rotates after an edit', async () => {
    backendMocks.createRegistrationForm
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw persistence detail',
          status: 503,
          code: 'registration_form_create_failed',
          requestId: 'registration-request-8',
        }),
      )
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'second raw persistence detail',
          status: 503,
          code: 'registration_form_create_failed',
          requestId: 'registration-request-9',
        }),
      )
      .mockResolvedValueOnce({ id: 'registration-form-1' });
    render(TestedCreateRegistrationForm);
    await reachBuilder();

    await fireEvent.click(screen.getByRole('button', { name: 'Save Form' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The registration form could not be saved. Support request: registration-request-8',
    );
    expect(alert).not.toHaveTextContent('raw persistence detail');
    const firstKey = backendMocks.createRegistrationForm.mock.calls[0][3];

    await fireEvent.click(screen.getByRole('button', { name: 'Retry Save' }));
    await waitFor(() => {
      expect(backendMocks.createRegistrationForm).toHaveBeenCalledTimes(2);
    });
    expect(backendMocks.createRegistrationForm.mock.calls[1][3]).toBe(firstKey);

    await fireEvent.input(screen.getAllByLabelText('Question')[0], {
      target: { value: 'Athlete Full Name' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Form' })).toBeEnabled();
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Form' }));
    expect(backendMocks.createRegistrationForm).toHaveBeenCalledTimes(3);
    expect(backendMocks.createRegistrationForm.mock.calls[2][3])
      .not.toBe(firstKey);
  });

  it('uses the exact archived update contract and refuses an unsupported lifecycle', async () => {
    backendMocks.updateRegistrationForm.mockResolvedValue({ id: 'form-closed' });
    const view = render(TestedCreateRegistrationForm, {
      form: {
        id: 'form-closed',
        title: 'Retired Registration',
        description: 'Original',
        rawStatus: 'archived',
        fields: {
          collectParentNames: false,
          collectDob: false,
        },
      },
    });
    await fireEvent.input(screen.getByLabelText('Description'), {
      target: { value: ' Updated retired form ' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Form' }));

    expect(backendMocks.updateRegistrationForm).toHaveBeenCalledWith(
      'tenant-a',
      'form-closed',
      expect.objectContaining({
        title: 'Retired Registration',
        description: 'Updated retired form',
        status: 'archived',
      }),
      'Registration form updated from CRM.',
      expect.stringMatching(/^registration-form-update:/),
    );
    expect(backendMocks.createRegistrationForm).not.toHaveBeenCalled();

    view.unmount();
    render(TestedCreateRegistrationForm, {
      form: {
        id: 'form-unknown',
        title: 'Unknown Registration',
        rawStatus: 'migrating',
      },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText(
        'This form has an unsupported lifecycle status. Saving is disabled to avoid reopening or retiring it accidentally.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Form' })).toBeDisabled();
  });

  it('invalidates an in-flight response when the organization changes', async () => {
    const pending = deferred<{ id: string }>();
    backendMocks.createRegistrationForm.mockReturnValue(pending.promise);
    render(TestedCreateRegistrationForm);
    await reachBuilder();
    await fireEvent.click(screen.getByRole('button', { name: 'Save Form' }));

    await act(async () => {
      tenants.set('tenant-b');
      pending.resolve({ id: 'stale-form' });
      await pending.promise;
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The organization or form details changed while saving.',
    );
    expect(screen.getByRole('button', { name: 'Retry Save' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Saved!' })).toBeNull();
  });
});
