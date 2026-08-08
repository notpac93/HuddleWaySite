import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
  reauthenticate: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
  emailCredential: vi.fn((email: string, password: string) => ({ email, password })),
}));

const backendMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  updateProfile: authMocks.updateProfile,
  updatePassword: authMocks.updatePassword,
  signOut: authMocks.signOut,
  reauthenticateWithCredential: authMocks.reauthenticate,
  verifyBeforeUpdateEmail: authMocks.verifyBeforeUpdateEmail,
  EmailAuthProvider: { credential: authMocks.emailCredential },
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    userStore: writable(null),
    activeTenantRole: writable('owner'),
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

vi.mock('../../src/lib/firebase', () => ({ auth: { name: 'test-auth' } }));

import { activeTenantRole, tenantIdStore, userStore } from '../../src/lib/authStore';
import SettingsManager from '../../src/components/crm/SettingsManager.svelte';
import StripeConnectManager from '../../src/components/crm/StripeConnectManager.svelte';

const TestedSettingsManager = SettingsManager as unknown as Component;
const TestedStripeConnectManager = StripeConnectManager as unknown as Component;
const users = userStore as Writable<{
  uid: string;
  displayName: string | null;
  email: string | null;
} | null>;
const activeRoles = activeTenantRole as Writable<string | null>;
const tenants = tenantIdStore as Writable<string>;

describe('SettingsManager profile persistence', () => {
  beforeEach(() => {
    authMocks.updateProfile.mockReset();
    authMocks.updatePassword.mockReset();
    authMocks.signOut.mockReset();
    authMocks.reauthenticate.mockReset();
    authMocks.verifyBeforeUpdateEmail.mockReset();
    authMocks.emailCredential.mockClear();
    backendMocks.request.mockReset();
    backendMocks.request.mockImplementation((path: string) => path.endsWith('/status') ? Promise.resolve({
      connected: false,
      stripeAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDueCount: 0,
    }) : Promise.resolve({}));
    activeRoles.set('owner');
    tenants.set('tenant-a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    users.set({
      uid: 'owner-a',
      displayName: 'Original Owner',
      email: 'owner@example.test',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes a valid name and persists it once', async () => {
    let resolveUpdate!: () => void;
    authMocks.updateProfile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(TestedSettingsManager);

    const name = screen.getByLabelText('Display name');
    const email = screen.getByLabelText('Email address');
    expect(email).not.toBeDisabled();
    expect(email).toHaveValue('owner@example.test');

    await fireEvent.input(name, { target: { value: '  Updated Owner  ' } });
    const save = screen.getByRole('button', { name: 'Save changes' });
    await fireEvent.click(save);
    await fireEvent.click(save);
    expect(authMocks.updateProfile).toHaveBeenCalledTimes(1);
    expect(authMocks.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'owner-a' }),
      { displayName: 'Updated Owner' },
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    resolveUpdate();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saved' })).toBeVisible(),
    );
    expect(name).toHaveValue('Updated Owner');
  });

  it('reauthenticates and sends verification before changing the email', async () => {
    authMocks.reauthenticate.mockResolvedValue(undefined);
    authMocks.verifyBeforeUpdateEmail.mockResolvedValue(undefined);
    authMocks.updateProfile.mockResolvedValue(undefined);
    render(TestedSettingsManager);

    await fireEvent.input(screen.getByLabelText('Email address'), {
      target: { value: 'new-owner@example.test' },
    });
    await fireEvent.input(screen.getByLabelText('Current password', {
      selector: '#settings-current-password',
    }), {
      target: { value: 'old-password' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saved' })).toBeVisible(),
    );
    expect(authMocks.emailCredential).toHaveBeenCalledWith(
      'owner@example.test',
      'old-password',
    );
    expect(authMocks.reauthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'owner-a' }),
      { email: 'owner@example.test', password: 'old-password' },
    );
    expect(authMocks.verifyBeforeUpdateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'owner-a' }),
      'new-owner@example.test',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Verification is waiting for new-owner@example.test',
    );
  });

  it('requires the current password for an email change', async () => {
    render(TestedSettingsManager);
    await fireEvent.input(screen.getByLabelText('Email address'), {
      target: { value: 'new-owner@example.test' },
    });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(authMocks.reauthenticate).not.toHaveBeenCalled();
    expect(authMocks.verifyBeforeUpdateEmail).not.toHaveBeenCalled();
  });

  it('blocks invalid names before a write and maps recent-login errors safely', async () => {
    render(TestedSettingsManager);
    const name = screen.getByLabelText('Display name');

    await fireEvent.input(name, { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(authMocks.updateProfile).not.toHaveBeenCalled();

    authMocks.updateProfile.mockRejectedValue(
      Object.assign(new Error('raw provider detail'), {
        code: 'auth/requires-recent-login',
      }),
    );
    await fireEvent.input(name, { target: { value: 'Valid Owner' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Sign out and sign in again before changing your display name.',
    );
    expect(alert).not.toHaveTextContent('raw provider detail');
  });

  it('rebinds the form when the authenticated user changes', async () => {
    render(TestedSettingsManager);
    expect(screen.getByLabelText('Display name')).toHaveValue('Original Owner');

    users.set({
      uid: 'editor-b',
      displayName: 'Second Admin',
      email: 'second@example.test',
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toHaveValue('Second Admin');
      expect(screen.getByLabelText('Email address')).toHaveValue(
        'second@example.test',
      );
    });
  });

  it('reauthenticates, changes the password, and signs the user out', async () => {
    authMocks.reauthenticate.mockResolvedValue(undefined);
    authMocks.updatePassword.mockResolvedValue(undefined);
    authMocks.signOut.mockResolvedValue(undefined);
    render(TestedSettingsManager);

    await fireEvent.input(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    await fireEvent.input(screen.getByLabelText('New password'), {
      target: { value: 'new-password-123' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password-123' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Password changed successfully. You have been signed out.',
      ),
    );
    expect(authMocks.emailCredential).toHaveBeenCalledWith(
      'owner@example.test',
      'old-password',
    );
    expect(authMocks.reauthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'owner-a' }),
      { email: 'owner@example.test', password: 'old-password' },
    );
    expect(authMocks.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'owner-a' }),
      'new-password-123',
    );
    expect(authMocks.signOut).toHaveBeenCalledWith({ name: 'test-auth' });
  });

  it('blocks a mismatched new password before contacting Firebase', async () => {
    render(TestedSettingsManager);
    await fireEvent.input(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    await fireEvent.input(screen.getByLabelText('New password'), {
      target: { value: 'new-password-123' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different-password' },
    });
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeDisabled();
    expect(authMocks.reauthenticate).not.toHaveBeenCalled();
    expect(authMocks.updatePassword).not.toHaveBeenCalled();
  });

  it('surfaces the tenant Stripe connection when no account is connected', async () => {
    render(TestedStripeConnectManager);

    expect(await screen.findByText('Not connected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect Stripe' })).toBeEnabled();
    expect(screen.getByText(/same tenant connection for paid registration checkout/i)).toBeVisible();
    expect(backendMocks.request).toHaveBeenCalledWith('/stripe/connect/status', { query: { tenantId: 'tenant-a' } });
  });

  it('starts the existing tenant onboarding workflow from Settings', async () => {
    backendMocks.request.mockImplementation((path: string) => path.endsWith('/account-link')
      ? Promise.resolve({ onboardingUrl: 'https://connect.stripe.com/setup/test' })
      : Promise.resolve({
        connected: false,
        stripeAccountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDueCount: 0,
      }));
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    render(TestedStripeConnectManager);

    await fireEvent.click(await screen.findByRole('button', { name: 'Connect Stripe' }));
    await waitFor(() =>
      expect(backendMocks.request).toHaveBeenCalledWith('/stripe/connect/account-link', expect.objectContaining({
        method: 'POST',
        body: { tenantId: 'tenant-a' },
        idempotencyKey: expect.stringMatching(/^stripe-connect-onboarding:/),
      })),
    );
    expect(window.open).toHaveBeenCalledWith(
      'https://connect.stripe.com/setup/test',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('offers reconnect when the saved tenant account belongs to another Stripe mode', async () => {
    backendMocks.request.mockImplementation((path: string) => path.endsWith('/status')
      ? Promise.resolve({
        connected: false,
        reconnectRequired: true,
        chargesEnabled: false,
        payoutsEnabled: false,
      })
      : Promise.resolve({ onboardingUrl: 'https://connect.stripe.com/setup/reconnect' }));
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    render(TestedStripeConnectManager);

    expect(await screen.findByText(/different Stripe mode/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reconnect Stripe' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Reconnect Stripe' }));
    await waitFor(() => expect(backendMocks.request).toHaveBeenCalledWith(
      '/stripe/connect/account-link',
      expect.objectContaining({
        method: 'POST',
        body: { tenantId: 'tenant-a' },
        idempotencyKey: expect.stringMatching(/^stripe-connect-onboarding:/),
      }),
    ));
  });

  it('shows tenant management and disconnect controls for a connected account', async () => {
    backendMocks.request.mockImplementation((path: string) => path.endsWith('/status')
      ? Promise.resolve({
        connected: true,
        stripeAccountId: 'acct_1234567890',
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsDueCount: 0,
      })
      : Promise.resolve({ disconnected: true }));
    render(TestedStripeConnectManager);

    expect(await screen.findByText('Ready for paid events')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm disconnect' }));
    await waitFor(() =>
      expect(backendMocks.request).toHaveBeenCalledWith('/stripe/connect/account', { method: 'DELETE', body: { tenantId: 'tenant-a' }}),
    );
    expect(await screen.findByText('Not connected')).toBeVisible();
  });

  it('does not label an account connected while Stripe onboarding is incomplete', async () => {
    backendMocks.request.mockImplementation((path: string) => path.endsWith('/status')
      ? Promise.resolve({
        connected: true,
        stripeAccountId: 'acct_incomplete',
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDueCount: 1,
      })
      : Promise.resolve({}));
    render(TestedStripeConnectManager);

    expect(await screen.findByText('Setup required')).toBeVisible();
    expect(screen.queryByText('Account connected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish Stripe setup' })).toBeEnabled();
  });
});
