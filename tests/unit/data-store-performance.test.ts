import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  financialOverview: vi.fn(),
  unsubscribeSnapshot: vi.fn(),
}));

const tenantIdStore = writable<string | null>(null);

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/lib/authStore', () => ({
  tenantIdStore,
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    financialOverview: testState.financialOverview,
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  documentId: () => '__name__',
  limit: (count: number) => ({ limit: count }),
  orderBy: (field: string) => ({ orderBy: field }),
  where: (field: string, operator: string, value: string) => ({
    field,
    operator,
    value,
  }),
  query: (...parts: unknown[]) => parts,
  onSnapshot: testState.onSnapshot,
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
  transactionsStore,
} = await import('../../src/lib/services/DataStore');

describe('CRM data-store performance boundaries', () => {
  beforeEach(() => {
    tenantIdStore.set(null);
    testState.onSnapshot.mockReset();
    testState.financialOverview.mockReset();
    testState.unsubscribeSnapshot.mockReset();
    testState.onSnapshot.mockReturnValue(testState.unsubscribeSnapshot);
    testState.financialOverview.mockResolvedValue({
      tenantId: 'fixture-tenant',
      transactions: [],
      refunds: [],
      invoices: [],
      deposits: [],
      truncated: {
        transactions: false,
        refunds: false,
        invoices: false,
        deposits: false,
      },
      requestId: 'request-1',
    });
  });

  it('does not open collection listeners or financial requests for dormant modules', () => {
    tenantIdStore.set('fixture-tenant');

    expect(testState.onSnapshot).not.toHaveBeenCalled();
    expect(testState.financialOverview).not.toHaveBeenCalled();
  });

  it('opens only the tenant collection whose mounted view subscribes', () => {
    tenantIdStore.set('fixture-tenant');
    const unsubscribe = registrationsStore.subscribe(() => {});

    expect(testState.onSnapshot).toHaveBeenCalledTimes(1);
    const queryParts = testState.onSnapshot.mock.calls[0][0];
    expect(queryParts[0]).toEqual({ name: 'registrations' });
    expect(queryParts[1]).toEqual({
      field: 'tenantId',
      operator: '==',
      value: 'fixture-tenant',
    });
    expect(queryParts[2]).toEqual({ orderBy: '__name__' });
    expect(queryParts[3]).toEqual({ limit: 501 });

    unsubscribe();
    expect(testState.unsubscribeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('shares one financial projection request across all active financial stores', async () => {
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

  it('keeps the dashboard collection budget at three listeners', () => {
    tenantIdStore.set('fixture-tenant');
    const unsubscribes = [
      registrationsStore.subscribe(() => {}),
      teamsStore.subscribe(() => {}),
      eventsStore.subscribe(() => {}),
    ];

    expect(testState.onSnapshot).toHaveBeenCalledTimes(3);
    expect(
      testState.onSnapshot.mock.calls.map((call) => call[0][0].name),
    ).toEqual(['registrations', 'teams', 'events']);

    unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  it('caps operational snapshots at 500 and exposes truncation without losing cleanup', () => {
    const snapshotHandlers = new Map<string, (snapshot: any) => void>();
    testState.onSnapshot.mockImplementation((sourceQuery, next) => {
      snapshotHandlers.set(sourceQuery[0].name, next);
      return testState.unsubscribeSnapshot;
    });
    tenantIdStore.set('fixture-tenant');
    let latestScope: any;
    const unsubscribeScope = operationalProjectionScope.subscribe((scope) => {
      latestScope = scope;
    });
    const unsubscribeRecords = registrationsStore.subscribe(() => {});

    snapshotHandlers.get('registrations')?.({
      docs: Array.from({ length: 501 }, (_, index) => ({
        id: `registration-${String(index).padStart(3, '0')}`,
        data: () => ({ tenantId: 'fixture-tenant' }),
      })),
    });

    expect(latestScope.limit).toBe(500);
    expect(latestScope.truncated.registrations).toBe(true);
    unsubscribeRecords();
    unsubscribeScope();
    expect(testState.unsubscribeSnapshot).toHaveBeenCalledTimes(5);
  });

  it('bounds every Dashboard collection at 501 reads and exposes only 500 records', () => {
    const snapshotHandlers = new Map<string, (snapshot: any) => void>();
    testState.onSnapshot.mockImplementation((sourceQuery, next) => {
      snapshotHandlers.set(sourceQuery[0].name, next);
      return testState.unsubscribeSnapshot;
    });
    tenantIdStore.set('fixture-tenant');
    const latest: Record<string, any> = {};
    const unsubscribes = [
      registrationsStore.subscribe((records) => {
        latest.registrations = records;
      }),
      registrationsProjectionScope.subscribe((scope) => {
        latest.registrationsScope = scope;
      }),
      teamsStore.subscribe((records) => {
        latest.teams = records;
      }),
      teamsProjectionScope.subscribe((scope) => {
        latest.teamsScope = scope;
      }),
      eventsStore.subscribe((records) => {
        latest.events = records;
      }),
      eventsProjectionScope.subscribe((scope) => {
        latest.eventsScope = scope;
      }),
    ];

    expect(testState.onSnapshot).toHaveBeenCalledTimes(3);
    for (const call of testState.onSnapshot.mock.calls) {
      expect(call[0][3]).toEqual({ limit: 501 });
      const collectionName = call[0][0].name;
      snapshotHandlers.get(collectionName)?.({
        docs: Array.from({ length: 501 }, (_, index) => ({
          id: `${collectionName}-${String(index).padStart(3, '0')}`,
          data: () => ({ tenantId: 'fixture-tenant' }),
        })),
      });
    }

    for (const collectionName of ['registrations', 'teams', 'events']) {
      expect(latest[collectionName]).toHaveLength(500);
      expect(latest[`${collectionName}Scope`]).toMatchObject({
        limit: 500,
        truncated: true,
        loading: false,
      });
    }
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    expect(testState.unsubscribeSnapshot).toHaveBeenCalledTimes(3);
  });
});
