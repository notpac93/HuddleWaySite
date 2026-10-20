import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ crmOperationalPage: vi.fn(), financialOverview: vi.fn() }));
vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable<string | null>(null) };
});
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: backend }));
vi.mock('../../src/lib/ui/csvExport', () => ({ downloadCsv: vi.fn() }));
vi.mock('../../src/lib/services/RegistrationService', () => ({
  RegistrationService: { subscribeToForms: vi.fn(() => () => {}) },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { refreshOperationalCollections } from '../../src/lib/services/DataStore';
import SeasonDetail from '../../src/components/crm/seasons/SeasonDetail.svelte';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const season = { id: 'season-1', name: 'Esports League', status: 'upcoming', teamId: 'esports' };
const seasonLinks = [{ id: 'season-row-1', seasonId: 'season-1', registrationId: 'registration-1', userId: 'user-1', status: 'registered' }];
function page(records: any[]) { return { records, hasMore: false, nextCursor: null }; }
function financials(transactions: any[] = []) {
  return {
    transactions, refunds: [], invoices: [], deposits: [],
    recordCounts: { transactions: transactions.length, payments: 0, refunds: 0, invoices: 0, deposits: 0 },
    tracking: { complete: true },
    truncated: { transactions: false, refunds: false, invoices: false, deposits: false },
    requestId: 'fixture-finance',
  };
}

describe('SeasonDetail cold-entry collection hydration', () => {
  beforeEach(() => {
    tenantIdStore.set(null);
    backend.crmOperationalPage.mockReset();
    backend.financialOverview.mockReset();
    backend.financialOverview.mockResolvedValue(financials());
    backend.crmOperationalPage.mockImplementation(async (_tenant: string, collection: string) => {
      if (collection === 'season_registrations') return page(seasonLinks);
      if (collection === 'events') return page([{ id: 'event-1', title: 'Season event', seasonId: 'season-1' }]);
      if (collection === 'teams') return page([{ id: 'esports', name: 'Esports League' }]);
      return page([]);
    });
  });

  it('starts the registration lookup from a cold season route and replaces missing names when it resolves', async () => {
    const registrations = deferred<any>();
    backend.crmOperationalPage.mockImplementation((_tenant: string, collection: string) => {
      if (collection === 'registrations') return registrations.promise;
      if (collection === 'season_registrations') return Promise.resolve(page(seasonLinks));
      return Promise.resolve(page([]));
    });
    tenantIdStore.set('fixture-tenant');
    render(SeasonDetail as unknown as Component, { season });
    await screen.findByText('Loading participant name…');
    expect(backend.crmOperationalPage).toHaveBeenCalledWith('fixture-tenant', 'registrations', { limit: 100, cursor: undefined });
    await act(() => registrations.resolve(page([{ id: 'registration-1', uid: 'user-1', participantSummary: { fullName: 'Fixture Participant' } }])));
    expect(await screen.findByText('Fixture Participant')).toBeVisible();
    expect(screen.queryByText('Participant name unavailable')).not.toBeInTheDocument();
    await act(async () => {
      backend.crmOperationalPage.mockImplementation(async (_tenant: string, collection: string) => collection === 'registrations'
        ? page([{ id: 'registration-1', uid: 'user-1', participantSummary: { fullName: 'Updated Fixture Participant' } }])
        : page([]));
      refreshOperationalCollections('registrations');
    });
    expect(await screen.findByText('Updated Fixture Participant')).toBeVisible();
  });

  it('recomputes season and participant finances after the linked event and financial stores resolve', async () => {
    const overview = deferred<any>();
    backend.financialOverview.mockReturnValue(overview.promise);
    tenantIdStore.set('fixture-tenant');
    render(SeasonDetail as unknown as Component, { season });
    await screen.findByText('Participant name unavailable');
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    await act(() => overview.resolve(financials([{
      id: 'payment-1', eventId: 'event-1', userId: 'user-1', status: 'succeeded',
      grossAmount: 1500, feeAmount: 201, netAmount: 1299, currency: 'USD',
    }])));
    await waitFor(() => expect(screen.getByText('$2.01')).toBeVisible());
    expect(screen.getByText('$15.00')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Scrollable season participants table' })).getByText('Paid')).toBeVisible();
  });
  it('surfaces a failed registration lookup, disables placeholder export, and retries only that collection', async () => {
    let lookup = 0;
    backend.crmOperationalPage.mockImplementation(async (_tenant: string, collection: string) => {
      if (collection === 'registrations') {
        if (++lookup === 1) throw new Error('offline');
        return page([{ id: 'registration-1', uid: 'user-1', participantSummary: { fullName: 'Recovered Fixture Participant' } }]);
      }
      return page(collection === 'season_registrations' ? seasonLinks : []);
    });
    tenantIdStore.set('fixture-tenant');
    render(SeasonDetail as unknown as Component, { season });
    expect(await screen.findByText(/Participant names could not be fully loaded/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
    const before = backend.crmOperationalPage.mock.calls.length;
    await fireEvent.click(screen.getByRole('button', { name: 'Retry participant names' }));
    expect(await screen.findByText('Recovered Fixture Participant')).toBeVisible();
    expect(backend.crmOperationalPage.mock.calls.slice(before).map(c => c[1])).toEqual(['registrations']);
    expect(screen.getByRole('button', { name: /Export/ })).toBeEnabled();
  });

});
