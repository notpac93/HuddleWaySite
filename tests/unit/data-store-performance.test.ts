import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  crmOperationalPage: vi.fn(),
  financialOverview: vi.fn(),
}));

const tenantIdStore = writable<string | null>(null);

vi.mock('../../src/lib/authStore', () => ({ tenantIdStore }));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: testState,
}));

const {
  eventsStore,
  eventsProjectionScope,
  financialProjectionScope,
  financialStoreError,
  invoicesStore,
  operationalProjectionScope,
  registrationsStore,
  registrationsProjectionScope,
  teamsStore,
  teamsProjectionScope,
  dashboardOperationalCountScope,
  transactionsStore,
  participantNameFromRegistration,
} = await import('../../src/lib/services/DataStore');

function page(
  collection: string,
  records: any[],
  hasMore = false,
  nextCursor: string | null = null,
) {
  return {
    schemaVersion: 'crm_operational_page_v1',
    tenantId: 'fixture-tenant',
    collection,
    records,
    hasMore,
    nextCursor,
    limit: 100,
    requestId: `request-${collection}`,
  };
}

describe('CRM data-store server paging boundaries', () => {
  beforeEach(() => {
    tenantIdStore.set(null);
    testState.crmOperationalPage.mockReset();
    testState.financialOverview.mockReset();
    testState.financialOverview.mockResolvedValue({
      tenantId: 'fixture-tenant',
      transactions: [],
      refunds: [],
      invoices: [],
      deposits: [],
      recordCounts: {
        transactions: 0,
        payments: 0,
        refunds: 0,
        invoices: 0,
        deposits: 0,
      },
      tracking: { complete: true },
      truncated: {
        transactions: false,
        refunds: false,
        invoices: false,
        deposits: false,
      },
      requestId: 'request-financial',
    });
    testState.crmOperationalPage.mockImplementation(
      async (_tenantId: string, collection: string) => page(collection, []),
    );
  });

  it('resolves participant names across supported registration shapes', () => {
    expect(participantNameFromRegistration({
      firstName: 'Adella',
      lastName: 'Fay',
    })).toBe('Adella Fay');
    expect(participantNameFromRegistration({
      formData: { player_name: 'Jordan Lee' },
    })).toBe('Jordan Lee');
    expect(participantNameFromRegistration({
      participantSummary: { firstName: 'Kai', lastName: 'Reed' },
    })).toBe('Kai Reed');
  });

  it('does not open operational or financial requests for a dormant tenant', () => {
    expect(testState.crmOperationalPage).not.toHaveBeenCalled();
    expect(testState.financialOverview).not.toHaveBeenCalled();
  });

  it('opens only the mounted tenant collection through the backend', () => {
    tenantIdStore.set('fixture-tenant');
    const unsubscribe = registrationsStore.subscribe(() => {});

    expect(testState.crmOperationalPage).toHaveBeenCalledTimes(1);
    expect(testState.crmOperationalPage).toHaveBeenCalledWith(
      'fixture-tenant',
      'registrations',
      { limit: 100, cursor: undefined },
    );
    unsubscribe();
  });

  it('shares one financial projection request across active financial stores', async () => {
    tenantIdStore.set('fixture-tenant');
    const unsubscribeTransactions = transactionsStore.subscribe(() => {});
    const unsubscribeInvoices = invoicesStore.subscribe(() => {});
    const unsubscribeError = financialStoreError.subscribe(() => {});

    await Promise.resolve();

    expect(testState.financialOverview).toHaveBeenCalledTimes(1);
    expect(testState.financialOverview).toHaveBeenCalledWith('fixture-tenant');

    unsubscribeTransactions();
    unsubscribeInvoices();
    unsubscribeError();
  });

  it('exposes financial loading before an authoritative overview resolves', async () => {
    let resolveOverview: (value: any) => void = () => {};
    testState.financialOverview.mockReturnValue(new Promise((resolve) => {
      resolveOverview = resolve;
    }));
    tenantIdStore.set('fixture-tenant');
    let latestScope: any;
    const unsubscribe = financialProjectionScope.subscribe((scope) => {
      latestScope = scope;
    });

    expect(latestScope.loading).toBe(true);
    resolveOverview({
      tenantId: 'fixture-tenant',
      transactions: [],
      refunds: [],
      invoices: [],
      deposits: [],
      recordCounts: {
        transactions: 0,
        payments: 0,
        refunds: 0,
        invoices: 0,
        deposits: 0,
      },
      tracking: { complete: true },
      truncated: {
        transactions: false,
        refunds: false,
        invoices: false,
        deposits: false,
      },
      requestId: 'request-loading',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(latestScope.loading).toBe(false);
    expect(latestScope.requestId).toBe('request-loading');
    unsubscribe();
  });

  it('pages the dashboard collections and reports complete counts after all pages resolve', async () => {
    testState.crmOperationalPage.mockImplementation(
      async (_tenantId: string, collection: string, options: { cursor?: string }) => {
        if (options.cursor) return page(collection, []);
        const records = collection === 'registrations'
          ? Array.from({ length: 501 }, (_, index) => ({ id: `registration-${index}` }))
          : collection === 'teams'
            ? [{ id: 'team-1', name: 'Boys' }, { id: 'team-2', name: 'Girls' }]
            : [{ id: 'event-1', lifecycleStatus: 'published' }];
        return page(collection, records, true, `${collection}-cursor`);
      },
    );
    tenantIdStore.set('fixture-tenant');
    let latestScope: any;
    const unsubscribeScope = dashboardOperationalCountScope.subscribe((scope) => {
      latestScope = scope;
    });
    let latestRecords: any[] = [];
    const unsubscribeRecords = registrationsStore.subscribe((records) => {
      latestRecords = records;
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(() => expect(latestRecords).toHaveLength(501));
    await vi.waitFor(() => expect(testState.crmOperationalPage).toHaveBeenCalledWith(
      'fixture-tenant',
      'registrations',
      { limit: 100, cursor: 'registrations-cursor' },
    ));
    expect(latestScope).toMatchObject({
      loading: false,
      registrations: 501,
      teams: 2,
      events: 1,
      error: '',
    });
    unsubscribeRecords();
    unsubscribeScope();
  });

  it('cleans up a paged projection without a live Firestore listener', async () => {
    let resolvePage!: (value: any) => void;
    testState.crmOperationalPage.mockReturnValueOnce(new Promise((resolve) => {
      resolvePage = resolve;
    }));
    tenantIdStore.set('fixture-tenant');
    let latestRecords: any[] = [];
    const unsubscribe = registrationsStore.subscribe((records) => {
      latestRecords = records;
    });
    unsubscribe();
    resolvePage(page('registrations', [{ id: 'stale' }]));
    await Promise.resolve();
    expect(latestRecords).toEqual([]);
  });

  it('exposes the complete operational projection shape', () => {
    tenantIdStore.set('fixture-tenant');
    let latest: any;
    const unsubscribe = operationalProjectionScope.subscribe((scope) => {
      latest = scope;
    });
    expect(latest).toMatchObject({
      limit: null,
      truncated: {
        registrations: false,
        teams: false,
        events: false,
      },
    });
    unsubscribe();
  });
});
