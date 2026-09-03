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
  };
});

vi.mock('../../src/lib/firebase', () => ({ auth: { name: 'test-auth' } }));

import { userStore } from '../../src/lib/authStore';
import SettingsManager from '../../src/components/crm/SettingsManager.svelte';

const TestedSettingsManager = SettingsManager as unknown as Component;
const users = userStore as Writable<{
  uid: string;
  displayName: string | null;
  email: string | null;
} | null>;

describe('SettingsManager profile persistence', () => {
  beforeEach(() => {
    authMocks.updateProfile.mockReset();
    authMocks.updatePassword.mockReset();
    authMocks.signOut.mockReset();
    authMocks.reauthenticate.mockReset();
    authMocks.verifyBeforeUpdateEmail.mockReset();
    authMocks.emailCredential.mockClear();
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
    const email = screen.getByLabelText('Login email address');
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

    await fireEvent.input(screen.getByLabelText('Login email address'), {
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
      'Account verification is waiting for new-owner@example.test',
    );
  });

  it('requires the current password for an email change', async () => {
    render(TestedSettingsManager);
    await fireEvent.input(screen.getByLabelText('Login email address'), {
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
      expect(screen.getByLabelText('Login email address')).toHaveValue(
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
});
