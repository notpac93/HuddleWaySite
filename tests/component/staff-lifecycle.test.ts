import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycleMocks = vi.hoisted(() => ({
  adminStaffDirectory: vi.fn(),
  updateStaffMembership: vi.fn(),
  revokeAdminInvite: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    adminStaffDirectory: lifecycleMocks.adminStaffDirectory,
    revokeAdminInvite: lifecycleMocks.revokeAdminInvite,
    updateStaffMembership: lifecycleMocks.updateStaffMembership,
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { backendClient } from '../../src/lib/api/backendClient';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import StaffManager from '../../src/components/crm/StaffManager.svelte';

const TestedStaffManager = StaffManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function directory(tenantId = 'tenant-a') {
  return {
    tenantId,
    staff: [{
      membershipId: 'membership-editor',
      uid: 'editor-user',
      role: 'editor',
      status: 'active',
      active: true,
      displayName: 'Editor One',
      email: 'editor@example.test',
      emailVerified: true,
      joinedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }],
    pendingInvites: [{
      id: 'invite-viewer',
      email: 'viewer@example.test',
      role: 'viewer',
      status: 'pending',
      displayName: 'Viewer Invite',
      createdAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
    }],
    truncated: { staff: false, pendingInvites: false },
    requestId: `request-${tenantId}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('StaffManager audited lifecycle controls', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    lifecycleMocks.adminStaffDirectory.mockReset();
    lifecycleMocks.adminStaffDirectory.mockImplementation(
      async (tenantId: string) => directory(tenantId),
    );
    lifecycleMocks.updateStaffMembership.mockReset();
    lifecycleMocks.revokeAdminInvite.mockReset();
  });

  it('retries an unchanged membership update with the same key and wires invite revocation', async () => {
    lifecycleMocks.updateStaffMembership
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw membership failure',
          status: 503,
          code: 'staff_update_failed',
          requestId: 'staff-support-3',
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        membershipId: 'membership-editor',
        role: 'viewer',
        status: 'active',
        requestId: 'request-update',
      });
    lifecycleMocks.revokeAdminInvite.mockResolvedValueOnce({
      success: true,
      inviteId: 'invite-viewer',
      status: 'revoked',
      requestId: 'request-revoke',
    });
    render(TestedStaffManager);

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Manage access' }),
    );
    const manageDialog = screen.getByRole('dialog', {
      name: 'Manage staff access',
    });
    await fireEvent.change(within(manageDialog).getByLabelText('Role'), {
      target: { value: 'viewer' },
    });
    await fireEvent.input(within(manageDialog).getByLabelText('Audit reason'), {
      target: { value: 'Change responsibilities' },
    });
    await fireEvent.click(
      within(manageDialog).getByRole('button', { name: 'Save access change' }),
    );
    expect(
      await within(manageDialog).findByText(
        'Staff access could not be changed.',
      ),
    ).toBeVisible();
    expect(manageDialog).toHaveTextContent('Support request: staff-support-3');
    expect(manageDialog).not.toHaveTextContent('raw membership failure');
    await fireEvent.click(
      within(manageDialog).getByRole('button', { name: 'Retry change' }),
    );
    expect(await screen.findByText('Staff membership access updated.')).toBeVisible();

    const updateMock = vi.mocked(backendClient.updateStaffMembership);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1][0].idempotencyKey)
      .toBe(updateMock.mock.calls[0][0].idempotencyKey);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Pending invites' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke' }),
    );
    const revokeDialog = screen.getByRole('dialog', {
      name: 'Revoke pending invitation?',
    });
    await fireEvent.input(within(revokeDialog).getByLabelText('Audit reason'), {
      target: { value: 'Invitation no longer needed' },
    });
    await fireEvent.click(
      within(revokeDialog).getByRole('button', { name: 'Revoke invitation' }),
    );

    expect(backendClient.revokeAdminInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        inviteId: 'invite-viewer',
        auditReason: 'Invitation no longer needed',
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it('distinguishes owner denial, exposes correlation, and retries the directory', async () => {
    lifecycleMocks.adminStaffDirectory.mockRejectedValueOnce(
      new BackendApiError({
        message: 'raw policy detail',
        status: 403,
        code: 'insufficient_capability',
        requestId: 'staff-directory-4',
      }),
    );
    render(TestedStaffManager);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Only organization owners can view and manage staff access.',
    );
    expect(alert).toHaveTextContent('Support request: staff-directory-4');
    expect(alert).not.toHaveTextContent('raw policy detail');

    await fireEvent.click(
      within(alert).getByRole('button', { name: 'Try again' }),
    );
    expect(await screen.findByText('Editor One')).toBeVisible();
    expect(lifecycleMocks.adminStaffDirectory).toHaveBeenCalledTimes(2);
  });

  it('locks the lifecycle dialog and submits only once', async () => {
    const pending = deferred<{
      success: true;
      membershipId: string;
      requestId: string;
    }>();
    lifecycleMocks.updateStaffMembership.mockReturnValue(pending.promise);
    render(TestedStaffManager);
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Manage access' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Manage staff access',
    });
    const role = within(dialog).getByLabelText('Role');
    const status = within(dialog).getByLabelText('Membership status');
    const reason = within(dialog).getByLabelText('Audit reason');
    await fireEvent.change(role, { target: { value: 'viewer' } });
    await fireEvent.input(reason, { target: { value: 'Role review' } });
    const save = within(dialog).getByRole('button', {
      name: 'Save access change',
    });
    await fireEvent.click(save);
    await fireEvent.click(save);

    expect(lifecycleMocks.updateStaffMembership).toHaveBeenCalledTimes(1);
    expect(role).toBeDisabled();
    expect(status).toBeDisabled();
    expect(reason).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Saving…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', {
        name: 'Close staff access dialog',
      }),
    ).toBeDisabled();

    pending.resolve({
      success: true,
      membershipId: 'membership-editor',
      requestId: 'request-update',
    });
    expect(
      await screen.findByText('Staff membership access updated.'),
    ).toBeVisible();
  });

  it('rejects stale directory results and resets filters on tenant switch', async () => {
    const tenantAResult = deferred<ReturnType<typeof directory>>();
    lifecycleMocks.adminStaffDirectory.mockReturnValueOnce(
      tenantAResult.promise,
    );
    render(TestedStaffManager);
    await fireEvent.input(
      screen.getByPlaceholderText('Search staff by name or email'),
      { target: { value: 'no match' } },
    );

    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(await screen.findByText('Editor One')).toBeVisible();
    expect(
      screen.getByPlaceholderText('Search staff by name or email'),
    ).toHaveValue('');

    tenantAResult.resolve(directory('tenant-a'));
    await tenantAResult.promise;
    await waitFor(() => {
      expect(screen.getByText('Editor One')).toBeVisible();
      expect(lifecycleMocks.adminStaffDirectory).toHaveBeenLastCalledWith(
        'tenant-b',
        100,
      );
    });
  });
});
