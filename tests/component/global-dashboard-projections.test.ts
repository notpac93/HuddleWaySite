import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const stores = vi.hoisted(() => {
  const writableStore = <T>(initialValue: T) => {
    let value = initialValue;
    const subscribers = new Set<(next: T) => void>();
    return {
      set(next: T) {
        value = next;
        subscribers.forEach((subscriber) => subscriber(value));
      },
      update(updater: (current: T) => T) {
        this.set(updater(value));
      },
      subscribe(subscriber: (next: T) => void) {
        subscribers.add(subscriber);
        subscriber(value);
        return () => subscribers.delete(subscriber);
      },
    };
  };
  const projection = () => ({
    limit: 500,
    truncated: false,
    loading: false,
    error: '',
    permissionDenied: false,
  });
  return {
    registrationsStore: writableStore<any[]>([]),
    teamsStore: writableStore<any[]>([]),
    eventsStore: writableStore<any[]>([]),
    transactionsStore: writableStore<any[]>([]),
    registrationsProjectionScope: writableStore(projection()),
    teamsProjectionScope: writableStore(projection()),
    eventsProjectionScope: writableStore(projection()),
    dashboardOperationalCountScope: writableStore({
      loading: false,
      registrations: 0,
      teams: 0,
      events: 0,
      error: '',
    }),
    financialProjectionScope: writableStore({
      loading: false,
      truncated: {
        transactions: false,
        refunds: false,
        invoices: false,
        deposits: false,
      },
      requestId: 'dashboard-finance-request',
      lastRefreshedAt: '2026-07-26T18:00:00.000Z',
      limitPerCollection: 500,
      error: '',
    }),
    activeTenantRole: writableStore<string | null>('owner'),
    tenantIdStore: writableStore<string | null>('fixture-tenant'),
  };
});

const backendMocks = vi.hoisted(() => ({
  crmDashboardSummary: vi.fn(),
}));

vi.mock('../../src/lib/services/DataStore', () => stores);

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

vi.mock('../../src/lib/authStore', () => ({
  activeTenantRole: stores.activeTenantRole,
  tenantIdStore: stores.tenantIdStore,
}));

import GlobalDashboard from '../../src/components/crm/GlobalDashboard.svelte';

const TestedGlobalDashboard = GlobalDashboard as unknown as Component;

function projection(truncated = false, error = '') {
  return {
    limit: 500,
    truncated,
    loading: false,
    error,
    permissionDenied: Boolean(error),
  };
}

describe('GlobalDashboard bounded operational summary', () => {
  beforeEach(() => {
    stores.activeTenantRole.set('owner');
    stores.registrationsStore.set([]);
    stores.teamsStore.set([]);
    stores.eventsStore.set([]);
    stores.transactionsStore.set([]);
    stores.registrationsProjectionScope.set(projection());
    stores.teamsProjectionScope.set(projection());
    stores.eventsProjectionScope.set(projection());
    stores.dashboardOperationalCountScope.set({
      loading: false,
      registrations: 0,
      teams: 0,
      events: 0,
      error: '',
    });
    stores.tenantIdStore.set('fixture-tenant');
    backendMocks.crmDashboardSummary.mockReset();
    backendMocks.crmDashboardSummary.mockResolvedValue({
      schemaVersion: 'crm_dashboard_summary_v1',
      tenantId: 'fixture-tenant',
      counts: { registrations: 0, teams: 0, events: 0 },
      recentRegistrations: [],
      requestId: 'dashboard-summary-request',
    });
    stores.financialProjectionScope.set({
      loading: false,
      truncated: {
        transactions: false,
        refunds: false,
        invoices: false,
        deposits: false,
      },
      requestId: 'dashboard-finance-request',
      lastRefreshedAt: '2026-07-26T18:00:00.000Z',
      limitPerCollection: 500,
      error: '',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses one bounded summary request instead of loading every operational record', async () => {
    backendMocks.crmDashboardSummary.mockResolvedValue({
      schemaVersion: 'crm_dashboard_summary_v1',
      tenantId: 'fixture-tenant',
      counts: { registrations: 501, teams: 42, events: 13 },
      recentRegistrations: [{
        id: 'registration-recent',
        participantSummary: { fullName: 'Recent Player' },
        payerSummary: { email: 'guardian@example.test' },
        createdAt: '2026-07-26T12:00:00.000Z',
      }],
      requestId: 'dashboard-summary-request',
    });
    stores.transactionsStore.set([{
      id: 'transaction-1',
      status: 'succeeded',
      grossAmount: 25_000,
      currency: 'usd',
    }]);
    stores.financialProjectionScope.update((scope) => ({
      ...scope,
      truncated: { ...scope.truncated, transactions: true },
    }));
    render(TestedGlobalDashboard);

    await waitFor(() => expect(backendMocks.crmDashboardSummary).toHaveBeenCalledWith('fixture-tenant'));

    const registrationsCard =
      screen.getByText('Registration Records').closest('dl');
    const teamsCard = screen.getByText('Teams').closest('dl');
    const eventsCard = screen.getByText('Events Managed').closest('dl');
    expect(registrationsCard).toHaveTextContent('501');
    expect(teamsCard).toHaveTextContent('42');
    expect(eventsCard).toHaveTextContent('13');
    expect(screen.getByText('Recent Player')).toBeVisible();
    expect(screen.getByText('Recent Registrations')).toBeVisible();
    expect(screen.queryByText(/Limited projection/)).not.toBeInTheDocument();

    const revenueCard =
      screen.getByText('Successful payment revenue').closest('dl');
    expect(revenueCard).toHaveTextContent('Unavailable');
    expect(revenueCard).toHaveTextContent(
      'Limited or invalid financial projection',
    );
    expect(revenueCard).not.toHaveTextContent('$250.00');
  });

  it('keeps supported legacy human names and emails without exposing IDs', async () => {
    backendMocks.crmDashboardSummary.mockResolvedValue({
      schemaVersion: 'crm_dashboard_summary_v1',
      tenantId: 'fixture-tenant',
      counts: { registrations: 1, teams: 0, events: 0 },
      recentRegistrations: [{
        id: 'internal-registration-id',
        firstName: 'Legacy',
        lastName: 'Player',
        email: 'legacy@example.test',
        createdAt: '2026-07-26T12:00:00.000Z',
      }],
      requestId: 'dashboard-summary-request',
    });
    render(TestedGlobalDashboard);

    expect(await screen.findByText('Legacy Player')).toBeVisible();
    expect(screen.getByText('legacy@example.test')).toBeVisible();
    expect(screen.queryByText('internal-registration-id')).toBeNull();
  });

  it('shows owner/editor quick-action boundaries and a read-only viewer state', () => {
    const { unmount } = render(TestedGlobalDashboard);
    expect(
      screen.getByRole('button', { name: 'Create Event' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Add Staff' }),
    ).toBeEnabled();
    unmount();

    stores.activeTenantRole.set('viewer');
    render(TestedGlobalDashboard);
    expect(
      screen.getByText(
        'Viewer access is read-only. Creation, editing, publishing, invitation, and deletion controls are not available.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Event' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeVisible();
  });

  it('masks every operational metric when the summary request fails', async () => {
    backendMocks.crmDashboardSummary.mockRejectedValue(new Error('denied'));
    render(TestedGlobalDashboard);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'Organization metrics could not be loaded. Metrics and recent records are unavailable.',
    ));
    for (const label of [
      'Registration Records',
      'Teams',
      'Events Managed',
    ]) {
      expect(screen.getByText(label).closest('dl')).toHaveTextContent('—');
    }
  });
});
