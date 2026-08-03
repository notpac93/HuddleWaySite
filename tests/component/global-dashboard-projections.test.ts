import { cleanup, render, screen } from '@testing-library/svelte';
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
  };
});

vi.mock('../../src/lib/services/DataStore', () => stores);

vi.mock('../../src/lib/authStore', () => ({
  activeTenantRole: stores.activeTenantRole,
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

describe('GlobalDashboard complete operational projections', () => {
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

  it('labels every capped operational projection and refuses a partial revenue total', () => {
    stores.registrationsStore.set(Array.from({ length: 500 }, (_, index) => ({
      id: `registration-${index}`,
      participantSummary: { fullName: `Participant ${index}` },
      payer: { email: `payer-${index}@example.test` },
      createdAt: new Date(2026, 6, 26, 12, 0, index % 60),
    })));
    stores.teamsStore.set(Array.from({ length: 500 }, (_, index) => ({
      id: `team-${index}`,
      name: `Team ${index}`,
    })));
    stores.eventsStore.set(Array.from({ length: 500 }, (_, index) => ({
      id: `event-${index}`,
      title: `Event ${index}`,
      lifecycleStatus: 'published',
      isVisible: true,
    })));
    stores.transactionsStore.set([{
      id: 'transaction-1',
      status: 'succeeded',
      grossAmount: 25_000,
      currency: 'usd',
    }]);
    stores.registrationsProjectionScope.set(projection(true));
    stores.teamsProjectionScope.set(projection(true));
    stores.eventsProjectionScope.set(projection(true));
    stores.dashboardOperationalCountScope.set({
      loading: false,
      registrations: 501,
      teams: 501,
      events: 501,
      error: '',
    });
    stores.financialProjectionScope.update((scope) => ({
      ...scope,
      truncated: { ...scope.truncated, transactions: true },
    }));
    render(TestedGlobalDashboard);

    const registrationsCard =
      screen.getByText('Registration Records').closest('dl');
    const teamsCard = screen.getByText('Teams').closest('dl');
    const eventsCard = screen.getByText('Events Managed').closest('dl');
    expect(registrationsCard).toHaveTextContent('500');
    expect(registrationsCard).toHaveTextContent(
      'Limited projection; exact count unavailable',
    );
    expect(teamsCard).toHaveTextContent('500');
    expect(eventsCard).toHaveTextContent('500');
    expect(screen.getByText('Recent Registrations')).toBeVisible();
    expect(
      screen.getByText(
        'Showing the most recent records available to this dashboard preview. Older records remain available in the Registrations workspace.',
      ),
    ).toBeVisible();

    const revenueCard =
      screen.getByText('Successful payment revenue').closest('dl');
    expect(revenueCard).toHaveTextContent('Unavailable');
    expect(revenueCard).toHaveTextContent(
      'Limited or invalid financial projection',
    );
    expect(revenueCard).not.toHaveTextContent('$250.00');
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

  it('masks every operational metric when one required projection fails', () => {
    stores.registrationsStore.set([{ id: 'registration-1' }]);
    stores.teamsStore.set([{ id: 'team-1' }]);
    stores.eventsStore.set([{ id: 'event-1' }]);
    stores.teamsProjectionScope.set(
      projection(false, 'You do not have permission to view teams.'),
    );
    render(TestedGlobalDashboard);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have permission to view teams. Metrics and recent records are unavailable.',
    );
    for (const label of [
      'Registration Records',
      'Teams',
      'Events Managed',
    ]) {
      expect(screen.getByText(label).closest('dl')).toHaveTextContent('—');
    }
  });
});
