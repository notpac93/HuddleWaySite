import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase', () => ({
  appCheck: null,
  auth: {},
  db: {},
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    activeTenantRole: writable('viewer'),
    authErrorStore: writable(null),
    availableTenants: writable(['tenant-viewer']),
    isAuthLoading: writable(false),
    tenantIdStore: writable('tenant-viewer'),
    userStore: writable({ uid: 'viewer-user' }),
  };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  const healthyScope = {
    limit: 500,
    truncated: false,
    loading: false,
    error: '',
    permissionDenied: false,
  };
  return {
    eventsStore: writable([]),
    eventsProjectionScope: writable({ ...healthyScope }),
    financialProjectionScope: writable({
      error: '',
      lastRefreshedAt: null,
      limitPerCollection: 500,
      truncated: { transactions: false },
    }),
    registrationsStore: writable([]),
    registrationsProjectionScope: writable({ ...healthyScope }),
    teamsStore: writable([]),
    teamsProjectionScope: writable({ ...healthyScope }),
    transactionsStore: writable([]),
  };
});

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
}));

import {
  activeTenantRole,
  authErrorStore,
  availableTenants,
  isAuthLoading,
  tenantIdStore,
  userStore,
} from '../../src/lib/authStore';
import CrmApp from '../../src/components/crm/CrmApp.svelte';

const TestedCrmApp = CrmApp as unknown as Component;
const role = activeTenantRole as Writable<string | null>;
const authError = authErrorStore as Writable<string | null>;
const tenants = tenantIdStore as Writable<string | null>;
const tenantChoices = availableTenants as Writable<string[]>;
const user = userStore as Writable<any>;
const authLoading = isAuthLoading as Writable<boolean>;

describe('CrmApp authentication, role, module, and tenant boundaries', () => {
  beforeEach(() => {
    role.set('viewer');
    authError.set(null);
    tenantChoices.set(['tenant-viewer']);
    tenants.set('tenant-viewer');
    user.set({
      uid: 'viewer-user',
      emailVerified: true,
    });
    authLoading.set(false);
  });

  it('loads a read-only Dashboard and does not expose mutation modules or quick actions', async () => {
    render(TestedCrmApp);

    await waitFor(() => {
      expect(
        screen.getByText(/Viewer access is read-only/),
      ).toBeVisible();
    });
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Teams' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create Event' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Staff' })).toBeNull();
  });

  it('limits editors to non-owner modules and rejects unsupported roles', async () => {
    role.set('editor');
    render(TestedCrmApp);
    await screen.findByText(/Overview of your organization's key metrics/i);

    expect(screen.getAllByRole('button', { name: 'Teams' })[0]).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Financials' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Staff' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();

    role.set('coach');
    expect(
      await screen.findByRole('heading', {
        name: 'Unsupported organization role',
      }),
    ).toBeVisible();
  });

  it('routes verified administrators without a tenant into free setup', async () => {
    role.set(null);
    tenants.set(null);
    render(TestedCrmApp);

    expect(
      await screen.findByRole('heading', {
        name: 'Set up your organization',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/Program creation and administration are free/i),
    ).toBeVisible();
    expect(screen.getByText(/no payment method is required/i)).toBeVisible();
  });

  it('blocks setup until email verification and surfaces membership errors', async () => {
    role.set(null);
    tenants.set(null);
    user.set({ uid: 'unverified-user', emailVerified: false });
    const view = render(TestedCrmApp);
    expect(
      screen.getByRole('heading', { name: 'Verify your email to continue' }),
    ).toBeVisible();
    expect(screen.getByText(/Program setup is free/)).toBeVisible();

    authError.set('Administrator access could not be verified.');
    user.set({ uid: 'verified-user', emailVerified: true });
    await view.rerender({});
    expect(
      screen.getByRole('heading', { name: 'Access could not be verified' }),
    ).toBeVisible();
  });

  it('tears down tenant state before publishing a mobile organization switch', async () => {
    role.set('owner');
    tenants.set('tenant-a');
    tenantChoices.set(['tenant-a', 'tenant-b']);
    render(TestedCrmApp);
    await screen.findByText(/Overview of your organization's key metrics/i);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Organization ID: tenant-b',
      }),
    );
    await waitFor(() => {
      let currentTenant: string | null = null;
      const unsubscribe = tenants.subscribe((value) => {
        currentTenant = value;
      });
      unsubscribe();
      expect(currentTenant).toBe('tenant-b');
    });
    expect(
      screen.getAllByRole('button', { name: 'Dashboard' })[0],
    ).toHaveAttribute('aria-current', 'page');
  });
});
