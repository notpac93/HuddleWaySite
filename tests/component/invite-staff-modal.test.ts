import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminInvite: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    createAdminInvite: mocks.createAdminInvite,
  },
}));

import { backendClient } from '../../src/lib/api/backendClient';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import InviteStaffModal from '../../src/components/crm/InviteStaffModal.svelte';

const TestedInviteStaffModal = InviteStaffModal as unknown as Component;

function inviteRecord() {
  return {
    id: 'invite-1',
    tenantId: 'tenant-a',
    email: 'coach@example.test',
    role: 'viewer' as const,
    firstName: 'Jordan',
    lastName: 'Coach',
    displayName: 'Jordan Coach',
    teamId: null,
    status: 'pending' as const,
    deliveryStatus: 'sent' as const,
    deliveryMessage: null,
    createdAt: '2026-07-26T00:00:00.000Z',
    expiresAt: '2026-08-26T00:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
  };
}

async function fillInvite(email = 'coach@example.test') {
  await fireEvent.input(screen.getByLabelText('First Name *'), {
    target: { value: 'Jordan' },
  });
  await fireEvent.input(screen.getByLabelText('Last Name *'), {
    target: { value: 'Coach' },
  });
  await fireEvent.input(screen.getByLabelText('Email Address *'), {
    target: { value: email },
  });
  await fireEvent.change(screen.getByLabelText('Role'), {
    target: { value: 'viewer' },
  });
}

describe('InviteStaffModal command states', () => {
  beforeEach(() => {
    vi.mocked(backendClient.createAdminInvite).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('validates required fields and submits the normalized invite once', async () => {
    let resolveInvite:
      | ((value: Awaited<ReturnType<typeof backendClient.createAdminInvite>>) => void)
      | undefined;
    vi.mocked(backendClient.createAdminInvite).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveInvite = resolve;
      }),
    );
    render(TestedInviteStaffModal);

    expect(screen.getByRole('button', { name: 'Review Invite' })).toBeDisabled();
    await fillInvite(' COACH@Example.Test ');
    await fireEvent.click(screen.getByRole('button', { name: 'Review Invite' }));
    const submit = screen.getByRole('button', { name: 'Confirm & Send Invite' });
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendClient.createAdminInvite).toHaveBeenCalledTimes(1);
    expect(backendClient.createAdminInvite).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      email: 'COACH@Example.Test',
      firstName: 'Jordan',
      lastName: 'Coach',
      role: 'viewer',
      idempotencyKey: expect.stringMatching(/^staff-invite:/),
    });
    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel staff invitation' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    resolveInvite?.(inviteRecord());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sent!' })).toBeDisabled();
    });
  });

  it('shows a support-safe error and preserves the key for an unchanged retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const inviteMock = vi.mocked(backendClient.createAdminInvite);
    inviteMock
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'provider token must not be shown',
          status: 503,
          code: 'invite_delivery_failed',
          requestId: 'invite-request-safe',
        }),
      )
      .mockResolvedValueOnce(inviteRecord());
    render(TestedInviteStaffModal);
    await fillInvite();

    await fireEvent.click(screen.getByRole('button', { name: 'Review Invite' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send Invite' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The staff invitation could not be sent.');
    expect(alert).not.toHaveTextContent('invite-request-safe');
    expect(alert).not.toHaveTextContent('provider token');
    const firstKey = inviteMock.mock.calls[0][0].idempotencyKey;

    await fireEvent.click(screen.getByRole('button', { name: 'Retry Invite' }));
    expect(inviteMock).toHaveBeenCalledTimes(2);
    expect(inviteMock.mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });

  it('rotates the operation key after the invite payload changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const inviteMock = vi.mocked(backendClient.createAdminInvite);
    inviteMock.mockRejectedValue(new Error('Simulated delivery failure'));
    render(TestedInviteStaffModal);
    await fillInvite();

    await fireEvent.click(screen.getByRole('button', { name: 'Review Invite' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send Invite' }));
    await screen.findByRole('alert');
    const firstKey = inviteMock.mock.calls[0][0].idempotencyKey;

    await fireEvent.input(screen.getByLabelText('Email Address *'), {
      target: { value: 'assistant@example.test' },
    });
    expect(screen.getByRole('button', { name: 'Review Invite' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review Invite' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send Invite' }));
    await waitFor(() => expect(inviteMock).toHaveBeenCalledTimes(2));
    expect(inviteMock.mock.calls[1][0].idempotencyKey).not.toBe(firstKey);
  });
});
