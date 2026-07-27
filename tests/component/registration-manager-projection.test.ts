import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  subscribeToForms: vi.fn(),
  fetchRegistrationDetailPage: vi.fn(),
  downloadCsv: vi.fn(),
  createRegistrationForm: vi.fn(),
  updateRegistrationForm: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/services/RegistrationService', () => ({
  RegistrationService: {
    subscribeToForms: serviceMocks.subscribeToForms,
    fetchRegistrationDetailPage:
      serviceMocks.fetchRegistrationDetailPage,
  },
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    DataStore: {
      getRegistrationFormFinancials: vi.fn(() => ({
        totalCollected: 0,
        totalFees: 0,
        totalRefunds: 0,
        totalBalance: 0,
        totalsAvailable: true,
        currency: 'USD',
        financialRecordCount: 0,
        scopeReason: 'No financial records.',
      })),
      getUserFinancialsForEvents: vi.fn(() => ({
        paymentStatus: 'Paid',
      })),
    },
    transactionsStore: writable([]),
    invoicesStore: writable([]),
    refundsStore: writable([]),
    eventsStore: writable([]),
  };
});

vi.mock('../../src/lib/ui/csvExport', () => ({
  downloadCsv: serviceMocks.downloadCsv,
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    createRegistrationForm: serviceMocks.createRegistrationForm,
    updateRegistrationForm: serviceMocks.updateRegistrationForm,
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import RegistrationManager from '../../src/components/crm/registration/RegistrationManager.svelte';

const TestedRegistrationManager =
  RegistrationManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

type Subscription = {
  tenantId: string;
  next: (forms: Array<Record<string, unknown>>) => void;
  error: (error: unknown) => void;
  scope: (scope: { truncated: boolean; limit: number }) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

let subscriptions: Subscription[] = [];

const activeForm = {
  id: 'form-active',
  title: 'Fall Registration',
  name: 'Fall Registration',
  rawStatus: 'active',
  status: 'Open',
  program: '12U Football',
  dateCreated: new Date('2026-07-01T12:00:00.000Z'),
};

const retiredForm = {
  id: 'form-retired',
  title: 'Spring Registration',
  name: 'Spring Registration',
  rawStatus: 'archived',
  status: 'Closed',
  program: '10U Baseball',
  dateCreated: new Date('2026-04-01T12:00:00.000Z'),
};

const unknownForm = {
  id: 'form-unknown',
  title: 'Imported Registration',
  name: 'Imported Registration',
  rawStatus: null,
  status: 'Status unavailable',
  program: null,
  dateCreated: null,
};

function detailPage(participantName = 'Jordan Player') {
  return {
    events: {
      records: [{
        id: 'event-1',
        title: 'Fall League',
        type: 'League',
        date: '2026-09-01T12:00:00.000Z',
        currency: 'USD',
        priceCents: 12_500,
      }],
      truncated: false,
      limit: 500,
    },
    participants: {
      records: [{
        id: 'registration-1',
        participantName,
        email: 'player@example.test',
        userId: 'user-1',
        status: 'Active',
        date: new Date('2026-07-01T12:00:00.000Z'),
      }],
      truncated: false,
      limit: 500,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('RegistrationManager projection and detail lifecycle', () => {
  beforeEach(() => {
    subscriptions = [];
    tenants.set('tenant-a');
    serviceMocks.subscribeToForms.mockReset();
    serviceMocks.fetchRegistrationDetailPage.mockReset();
    serviceMocks.downloadCsv.mockReset();
    serviceMocks.createRegistrationForm.mockReset();
    serviceMocks.updateRegistrationForm.mockReset();
    serviceMocks.subscribeToForms.mockImplementation(
      (
        tenantId: string,
        next: Subscription['next'],
        error: Subscription['error'],
        scope: Subscription['scope'],
      ) => {
        const unsubscribe = vi.fn();
        subscriptions.push({ tenantId, next, error, scope, unsubscribe });
        return unsubscribe;
      },
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders exact lifecycle tabs, one scoped toolbar, exports each view, and opens create', async () => {
    render(TestedRegistrationManager);
    expect(screen.getByText('Loading records…')).toBeVisible();
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].tenantId).toBe('tenant-a');

    await act(async () => {
      subscriptions[0].scope({ truncated: true, limit: 500 });
      subscriptions[0].next([activeForm, retiredForm, unknownForm]);
    });

    expect(
      screen.getByText(
        'Showing the first 500 forms by record ID. Search, export, and totals apply only to this loaded set.',
      ),
    ).toBeVisible();
    expect(screen.getAllByText('Fall Registration').length)
      .toBeGreaterThan(0);
    expect(screen.queryByText('Spring Registration')).toBeNull();
    expect(screen.queryByText('Imported Registration')).toBeNull();
    expect(
      screen.getAllByLabelText('Search registration forms'),
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(1);

    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(serviceMocks.downloadCsv).toHaveBeenLastCalledWith(
      [{
        id: 'form-active',
        name: 'Fall Registration',
        status: 'Open',
        program: '12U Football',
        createdAt: '2026-07-01T12:00:00.000Z',
      }],
      expect.any(Array),
      'registration-forms-Active',
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Retired' }));
    expect(screen.getAllByText('Spring Registration').length)
      .toBeGreaterThan(0);
    expect(screen.queryByText('Fall Registration')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(serviceMocks.downloadCsv.mock.calls.at(-1)?.[2])
      .toBe('registration-forms-Retired');
    expect(serviceMocks.downloadCsv.mock.calls.at(-1)?.[0])
      .toEqual([expect.objectContaining({ id: 'form-retired' })]);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Needs Review' }),
    );
    expect(screen.getAllByText('Imported Registration').length)
      .toBeGreaterThan(0);
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(serviceMocks.downloadCsv.mock.calls.at(-1)?.[2])
      .toBe('registration-forms-Needs Review');
    expect(serviceMocks.downloadCsv.mock.calls.at(-1)?.[0])
      .toEqual([expect.objectContaining({ id: 'form-unknown' })]);

    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Create New Registration Form',
      }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Create New Registration Form' }),
    ).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('retries failed subscriptions and ignores the replaced same-tenant listener', async () => {
    render(TestedRegistrationManager);
    await act(async () => {
      subscriptions[0].error({ code: 'firestore/permission-denied' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have permission to view registration forms.',
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading forms' }),
    );
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading records…')).toBeVisible();

    await act(async () => {
      subscriptions[0].scope({ truncated: true, limit: 12 });
      subscriptions[0].next([retiredForm]);
    });
    expect(screen.queryByText('Spring Registration')).toBeNull();
    expect(screen.queryByText(/first 12 forms/)).toBeNull();

    await act(async () => {
      subscriptions[1].next([activeForm]);
    });
    expect(screen.getAllByText('Fall Registration').length)
      .toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retries a permission-denied detail, applies live form updates, and backs out if removed', async () => {
    serviceMocks.fetchRegistrationDetailPage
      .mockRejectedValueOnce({ code: 'firestore/permission-denied' })
      .mockResolvedValueOnce(detailPage());
    render(TestedRegistrationManager);
    await act(async () => {
      subscriptions[0].next([activeForm]);
    });

    await fireEvent.click(
      screen.getAllByRole('button', { name: 'Open details' })[0],
    );
    expect(
      await screen.findByText(
        'You do not have permission to view this registration detail.',
      ),
    ).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading detail' }),
    );
    expect(serviceMocks.fetchRegistrationDetailPage).toHaveBeenCalledTimes(2);
    expect(serviceMocks.fetchRegistrationDetailPage).toHaveBeenLastCalledWith(
      'tenant-a',
      'form-active',
    );
    expect(await screen.findByText('Jordan Player')).toBeVisible();

    await act(async () => {
      subscriptions[0].next([{
        ...activeForm,
        name: 'Updated Fall Registration',
      }]);
    });
    expect(
      screen.getByRole('heading', { name: 'Updated Fall Registration' }),
    ).toBeVisible();

    await act(async () => {
      subscriptions[0].next([]);
    });
    expect(
      screen.getByRole('button', {
        name: 'Create New Registration Form',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Jordan Player')).toBeNull();
  });

  it('rejects a stale detail response after an organization switch', async () => {
    const pending = deferred<ReturnType<typeof detailPage>>();
    serviceMocks.fetchRegistrationDetailPage.mockReturnValue(pending.promise);
    render(TestedRegistrationManager);
    await act(async () => {
      subscriptions[0].next([activeForm]);
    });
    await fireEvent.click(
      screen.getAllByRole('button', { name: 'Open details' })[0],
    );

    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1].tenantId).toBe('tenant-b');
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(detailPage('Stale Participant'));
      await pending.promise;
      subscriptions[1].next([]);
    });

    expect(screen.queryByText('Stale Participant')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Create New Registration Form',
      }),
    ).toBeVisible();
  });
});
