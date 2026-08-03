import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase', () => ({
  appCheck: null,
  auth: {},
  db: {},
  firebaseEnvironment: { config: { projectId: 'huddleway-dev' } },
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    activeTenantRole: writable('owner'),
    authErrorStore: writable(null),
    availableTenants: writable(['tenant-a']),
    canViewTenantOperationsStore: writable(false),
    isAuthLoading: writable(false),
    tenantIdStore: writable('tenant-a'),
    tenantOperationsRoleStore: writable(null),
    userStore: writable({
      uid: 'owner-user',
      emailVerified: true,
    }),
  };
});

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
}));

vi.mock('../../src/components/crm/GlobalDashboard.svelte', () => {
  throw new Error('raw lazy import detail');
});

import CrmApp from '../../src/components/crm/CrmApp.svelte';

const TestedCrmApp = CrmApp as unknown as Component;

describe('CrmApp lazy module failure', () => {
  it('shows a safe retry surface and never exposes import details', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    render(TestedCrmApp);

    expect(
      await screen.findByRole('heading', { name: 'Module unavailable' }),
    ).toBeVisible();
    expect(screen.getByText(/Dashboard module could not be loaded/)).toBeVisible();
    expect(screen.queryByText('raw lazy import detail')).toBeNull();

    await fireEvent.click(
      screen.getByRole('button', { name: 'Try again' }),
    );
    await waitFor(() => {
      expect(consoleError.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText('raw lazy import detail')).toBeNull();
    consoleError.mockRestore();
  });
});
