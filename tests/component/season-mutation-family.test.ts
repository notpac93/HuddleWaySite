import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  updateEvent: vi.fn(),
  uploadImageAsset: vi.fn(),
}));
const csvMocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

vi.mock('../../src/lib/ui/csvExport', () => csvMocks);

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/services/RegistrationService', () => ({
    RegistrationService: {
      subscribeToForms: vi.fn((
        _tenantId: string,
        onForms: (forms: unknown[]) => void,
        _onError: (error: unknown) => void,
      ) => {
        onForms([{ id: 'form-1', title: 'Fall registration' }]);
        return () => {};
      }),
  },
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  const healthy = {
    limit: 500,
    truncated: false,
    loading: false,
    error: '',
    permissionDenied: false,
  };
  const financial = {
    loading: false,
    truncated: {
      transactions: false,
      refunds: false,
      invoices: false,
      deposits: false,
    },
    requestId: 'financial-request-1',
    lastRefreshedAt: '2030-01-01T00:00:00.000Z',
    limitPerCollection: 500,
    error: '',
  };
  return {
    DataStore: {
      getSeasonFinancials: () => ({
        totalCollected: 15000,
        totalFees: 300,
        totalRefunds: 0,
        totalBalance: 0,
        participants: 1,
        totalsAvailable: true,
        currency: 'USD',
        financialRecordCount: 1,
        scopeReason: '',
      }),
      getUserFinancialsForSeason: () => ({
        paymentStatus: 'Paid',
        totalsAvailable: true,
      }),
    },
    seasonsStore: writable([{
      id: 'season-1',
      name: 'Fall League',
      status: 'active',
      startDate: '2030-08-01',
      endDate: '2030-11-01',
      teamId: 'team-1',
    }]),
    eventsStore: writable([{
      id: 'event-1',
      title: 'Opening practice',
      date: '2030-08-10T16:00:00.000Z',
      type: 'Practice',
      seasonId: null,
      lifecycleStatus: 'draft',
    }]),
    seasonRegistrationsStore: writable([{
      id: 'season-registration-1',
      seasonId: 'season-1',
      userId: 'user-1',
      status: 'registered',
      createdAt: '2030-08-01T00:00:00.000Z',
    }]),
    transactionsStore: writable([]),
    invoicesStore: writable([]),
    usersMap: writable({ 'user-1': 'Jordan Lee' }),
    registrationNamesMap: writable({}),
    seasonsProjectionScope: writable(healthy),
    eventsProjectionScope: writable(healthy),
    seasonRegistrationsProjectionScope: writable(healthy),
    financialProjectionScope: writable(financial),
  };
});

import { tenantIdStore } from '../../src/lib/authStore';
import {
  eventsProjectionScope,
  eventsStore,
  financialProjectionScope,
  seasonRegistrationsProjectionScope,
  seasonRegistrationsStore,
  seasonsProjectionScope,
  seasonsStore,
} from '../../src/lib/services/DataStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import CreateSeasonModal from '../../src/components/crm/seasons/CreateSeasonModal.svelte';
import EditSeasonModal from '../../src/components/crm/seasons/EditSeasonModal.svelte';
import LinkEventModal from '../../src/components/crm/seasons/LinkEventModal.svelte';
import SeasonDetail from '../../src/components/crm/seasons/SeasonDetail.svelte';
import SeasonsManager from '../../src/components/crm/seasons/SeasonsManager.svelte';

const TestedCreateSeasonModal = CreateSeasonModal as unknown as Component;
const TestedEditSeasonModal = EditSeasonModal as unknown as Component;
const TestedLinkEventModal = LinkEventModal as unknown as Component;
const TestedSeasonDetail = SeasonDetail as unknown as Component;
const TestedSeasonsManager = SeasonsManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const seasonRecords = seasonsStore as Writable<any[]>;
const eventRecords = eventsStore as Writable<any[]>;
const seasonRegistrationRecords =
  seasonRegistrationsStore as Writable<any[]>;
const seasonScope = seasonsProjectionScope as Writable<any>;
const eventScope = eventsProjectionScope as Writable<any>;
const registrationScope = seasonRegistrationsProjectionScope as Writable<any>;
const financeScope = financialProjectionScope as Writable<any>;
const healthyScope = {
  limit: 500,
  truncated: false,
  loading: false,
  error: '',
  permissionDenied: false,
};
const healthyFinanceScope = {
  loading: false,
  truncated: {
    transactions: false,
    refunds: false,
    invoices: false,
    deposits: false,
  },
  requestId: 'financial-request-1',
  lastRefreshedAt: '2030-01-01T00:00:00.000Z',
  limitPerCollection: 500,
  error: '',
};
const fallLeague = {
  id: 'season-1',
  name: 'Fall League',
  status: 'active',
  startDate: '2030-08-01',
  endDate: '2030-11-01',
  teamId: 'team-1',
};
const openingPractice = {
  id: 'event-1',
  title: 'Opening practice',
  date: '2030-08-10T16:00:00.000Z',
  type: 'Practice',
  seasonId: null,
  lifecycleStatus: 'draft',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function fillCreateSeason() {
  await fireEvent.input(screen.getByLabelText('Season Name'), {
    target: { value: '  Winter League  ' },
  });
  await fireEvent.input(screen.getByLabelText('Start Date'), {
    target: { value: '2030-12-01' },
  });
  await fireEvent.input(screen.getByLabelText('End Date'), {
    target: { value: '2031-02-01' },
  });
}

describe('season mutation family', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    seasonRecords.set([fallLeague]);
    eventRecords.set([openingPractice]);
    seasonRegistrationRecords.set([{
      id: 'season-registration-1',
      seasonId: 'season-1',
      userId: 'user-1',
      status: 'registered',
      createdAt: '2030-08-01T00:00:00.000Z',
    }]);
    seasonScope.set(healthyScope);
    eventScope.set(healthyScope);
    registrationScope.set(healthyScope);
    financeScope.set(healthyFinanceScope);
    for (const mock of Object.values(backendMocks)) mock.mockReset();
    csvMocks.downloadCsv.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates a normalized season with one stable in-flight request', async () => {
    const pending = deferred<{ id: string }>();
    backendMocks.createSeason.mockReturnValue(pending.promise);
    render(TestedCreateSeasonModal, {
      activeTeam: { id: 'team-1' },
    });
    await fillCreateSeason();
    const create = screen.getByRole('button', { name: 'Create Season' });
    await fireEvent.click(create);
    await fireEvent.click(create);

    expect(backendMocks.createSeason).toHaveBeenCalledTimes(1);
    expect(backendMocks.createSeason).toHaveBeenCalledWith(
      'tenant-a',
      {
        teamId: 'team-1',
        name: 'Winter League',
        startDate: '2030-12-01',
        endDate: '2031-02-01',
        status: 'active',
        registrationFormId: null,
      },
      'Season created from CRM.',
      expect.stringContaining('season-create:'),
    );
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Season Name')).toBeDisabled();

    pending.resolve({ id: 'season-2' });
    await pending.promise;
  });

  it('blocks an invalid season date range before calling the backend', async () => {
    render(TestedCreateSeasonModal);
    await fillCreateSeason();
    await fireEvent.input(screen.getByLabelText('End Date'), {
      target: { value: '2030-01-01' },
    });
    expect(screen.getByRole('button', { name: 'Create Season' })).toBeDisabled();
    expect(backendMocks.createSeason).not.toHaveBeenCalled();
  });

  it('invalidates a create response when the tenant changes', async () => {
    const pending = deferred<{ id: string }>();
    backendMocks.createSeason.mockReturnValue(pending.promise);
    render(TestedCreateSeasonModal);
    await fillCreateSeason();
    await fireEvent.click(screen.getByRole('button', { name: 'Create Season' }));

    await act(async () => {
      tenants.set('tenant-b');
      pending.resolve({ id: 'season-2' });
      await pending.promise;
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The organization or season details changed while saving.',
    );
    expect(screen.queryByRole('button', { name: 'Created!' })).toBeNull();
  });

  it('masks edit errors and reuses the unchanged retry key', async () => {
    backendMocks.updateSeason
      .mockRejectedValueOnce(new BackendApiError({
        message: 'raw season datastore failure',
        status: 503,
        code: 'season_write_failed',
        requestId: 'season-request-4',
      }))
      .mockResolvedValueOnce(undefined);
    render(TestedEditSeasonModal, { season: fallLeague });
    await fireEvent.click(screen.getByRole('button', {
      name: 'Save Changes',
    }));
    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(
      'The season could not be updated. Support request: season-request-4',
    );
    expect(failure).not.toHaveTextContent('raw season datastore failure');
    await fireEvent.click(screen.getByRole('button', {
      name: 'Retry Season Update',
    }));
    await waitFor(() => expect(backendMocks.updateSeason).toHaveBeenCalledTimes(2));
    expect(backendMocks.updateSeason.mock.calls[1][4])
      .toBe(backendMocks.updateSeason.mock.calls[0][4]);
  });

  it('rejects non-image files before updating a season', async () => {
    render(TestedEditSeasonModal, { season: fallLeague });
    await fireEvent.change(screen.getByLabelText('Season Banner Graphic'), {
      target: {
        files: [new File(['not-an-image'], 'banner.txt', { type: 'text/plain' })],
      },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a PNG, JPG, GIF, or WebP image.',
    );
    expect(backendMocks.updateSeason).not.toHaveBeenCalled();
  });

  it('links one event with safe failure copy and a stable retry identity', async () => {
    backendMocks.updateEvent
      .mockRejectedValueOnce(new BackendApiError({
        message: 'raw event write failure',
        status: 503,
        code: 'event_write_failed',
        requestId: 'event-link-request-7',
      }))
      .mockResolvedValueOnce(undefined);
    render(TestedLinkEventModal, { season: fallLeague });
    await fireEvent.click(screen.getByRole('button', {
      name: 'Link to Season',
    }));
    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(
      'The event could not be linked. Support request: event-link-request-7',
    );
    expect(failure).not.toHaveTextContent('raw event write failure');
    await fireEvent.click(screen.getByRole('button', {
      name: 'Retry Link',
    }));
    await waitFor(() => expect(backendMocks.updateEvent).toHaveBeenCalledTimes(2));
    expect(backendMocks.updateEvent.mock.calls[0]).toEqual([
      'tenant-a',
      'event-1',
      { seasonId: 'season-1' },
      'Event linked to season from CRM.',
      expect.stringContaining('event-season-link:'),
    ]);
    expect(backendMocks.updateEvent.mock.calls[1][4])
      .toBe(backendMocks.updateEvent.mock.calls[0][4]);
  });

  it('reports truncated and malformed link candidates without rendering bad rows', () => {
    eventRecords.set([
      { ...openingPractice, id: '' },
      openingPractice,
    ]);
    eventScope.set({ ...healthyScope, truncated: true });
    render(TestedLinkEventModal, { season: fallLeague });
    expect(screen.getByText(
      'Only the first 500 events are loaded. Search results may be incomplete.',
    )).toBeVisible();
    expect(screen.getByText(
      '1 malformed event record was omitted because no stable identifier was available.',
    )).toBeVisible();
    expect(screen.getAllByText('Opening practice')).toHaveLength(1);
  });

  it('renders manager projection states and omits malformed seasons', () => {
    seasonRecords.set([
      { ...fallLeague, id: '' },
      fallLeague,
    ]);
    seasonScope.set({ ...healthyScope, truncated: true });
    render(TestedSeasonsManager);
    expect(screen.getByText(
      'Only the first 500 seasons are loaded. Search and counts may be incomplete.',
    )).toBeVisible();
    expect(screen.getByText(
      '1 malformed season record was omitted because no stable identifier was available.',
    )).toBeVisible();
    expect(screen.getAllByText('Fall League').length).toBeGreaterThan(0);
  });

  it('wires card and table edit controls to the authoritative editor', async () => {
    render(TestedSeasonsManager);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit Season' })).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('button', { name: 'Table' }))
      .toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit Season' })).toBeVisible();
  });

  it('requires typed confirmation before unlinking a season event', async () => {
    eventRecords.set([{ ...openingPractice, seasonId: 'season-1' }]);
    backendMocks.updateEvent.mockResolvedValue(undefined);
    render(TestedSeasonDetail, { season: fallLeague });
    await fireEvent.click(screen.getByRole('button', { name: /Events/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    const confirm = screen.getByRole('button', { name: 'Confirm unlink' });
    expect(confirm).toBeDisabled();
    await fireEvent.input(screen.getByLabelText('Audit reason'), {
      target: { value: 'Remove the incorrectly linked event.' },
    });
    await fireEvent.input(screen.getByLabelText(/Type UNLINK EVENT/), {
      target: { value: 'UNLINK EVENT' },
    });
    expect(confirm).toBeEnabled();
    await fireEvent.click(confirm);
    await waitFor(() => expect(backendMocks.updateEvent).toHaveBeenCalledTimes(1));
    expect(backendMocks.updateEvent).toHaveBeenCalledWith(
      'tenant-a',
      'event-1',
      { seasonId: null },
      'Remove the incorrectly linked event.',
      expect.stringContaining('event-season-unlink:'),
    );
  });

  it('clears selected season details when tenant scope changes', async () => {
    render(TestedSeasonsManager);
    await fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(screen.getByRole('heading', {
      name: 'Fall League',
      level: 1,
    })).toBeVisible();
    await act(async () => {
      tenants.set('tenant-b');
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', {
        name: 'Fall League',
        level: 1,
      })).toBeNull();
    });
    expect(screen.getByRole('heading', {
      name: 'Seasons & Leagues',
    })).toBeVisible();
  });

  it('makes detail exports unavailable for incomplete projections', () => {
    registrationScope.set({ ...healthyScope, truncated: true });
    render(TestedSeasonDetail, { season: fallLeague });
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByText(
      'The season registration projection is limited. Counts and export are unavailable.',
    )).toBeVisible();
    expect(csvMocks.downloadCsv).not.toHaveBeenCalled();
  });

  it('omits malformed participant and event identifiers in season detail', async () => {
    seasonRegistrationRecords.set([
      {
        id: '',
        seasonId: 'season-1',
        userId: 'user-2',
        status: 'registered',
      },
      {
        id: 'season-registration-1',
        seasonId: 'season-1',
        userId: 'user-1',
        status: 'registered',
      },
    ]);
    eventRecords.set([
      { ...openingPractice, id: '', seasonId: 'season-1' },
      { ...openingPractice, seasonId: 'season-1' },
    ]);
    render(TestedSeasonDetail, { season: fallLeague });
    expect(screen.getByText(
      '1 malformed registration record was omitted because no stable identifier was available.',
    )).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: /Events/ }));
    expect(screen.getByText(
      '1 malformed event record was omitted because no stable identifier was available.',
    )).toBeVisible();
    expect(screen.getAllByText('Opening practice')).toHaveLength(1);
  });
});
