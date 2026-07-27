import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  updateProfile: authMocks.updateProfile,
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    userStore: writable(null),
  };
});

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

  it('normalizes a valid name, persists it once, and keeps email read-only', async () => {
    let resolveUpdate!: () => void;
    authMocks.updateProfile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(TestedSettingsManager);

    const name = screen.getByLabelText('Display name');
    const email = screen.getByLabelText('Email address');
    expect(email).toBeDisabled();
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
});
