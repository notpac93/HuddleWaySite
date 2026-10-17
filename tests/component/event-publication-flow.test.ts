import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  updateEvent: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('fixture-tenant'),
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
    refreshOperationalCollections: vi.fn(),
    DataStore: {
      getEventRegistrationCount: () => 0,
    },
    eventsStore: writable([
      {
        id: 'event-1',
        title: 'Opening practice',
        date: '2030-08-10T16:00:00.000Z',
        endDate: '2030-08-10T18:00:00.000Z',
        dateKey: '2030-08-10',
        location: 'Field One',
        lifecycleStatus: 'draft',
        isVisible: false,
        isDeleted: false,
        teamId: 'team-1',
        eventSeriesId: 'series-1',
        isMultiDateSeries: false,
      },
    ]),
    registrationsStore: writable([]),
    seasonsStore: writable([]),
    teamsStore: writable([{ id: 'team-1', name: 'Tigers' }]),
    eventsProjectionScope: writable(healthyScope),
    registrationsProjectionScope: writable(healthyScope),
    teamsProjectionScope: writable(healthyScope),
  };
});

import { get, type Writable } from 'svelte/store';
import { eventsStore } from '../../src/lib/services/DataStore';
import { programProfileStore } from '../../src/lib/crm/programVocabulary';
import EventScheduler from '../../src/components/crm/EventScheduler.svelte';

const TestedEventScheduler = EventScheduler as unknown as Component;

const eventRecords = eventsStore as Writable<any[]>;
const baseline = get(eventRecords);
describe('event publication flow', () => {
  beforeEach(() => { eventRecords.set(baseline); programProfileStore.set({ tenantId: '', profile: null }); });
  it('shows a yoga empty state without filters and uses class creation wording', async () => {
    eventRecords.set([]);
    programProfileStore.set({ tenantId: 'fixture-tenant', profile: { catalogVersion: 1, profileId: 'yoga', group: 'Class', groups: 'Classes' } });
    render(TestedEventScheduler);
    expect(screen.getByRole('heading', { name: 'Classes' })).toBeVisible();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create your first class' })).toBeVisible();
  });
  it('keeps published items above drafts with secondary filters collapsed', async () => {
    eventRecords.set([{ ...baseline[0], id: 'published', title: 'Published practice', date: '2031-08-10T16:00:00.000Z', lifecycleStatus: 'published' }, ...baseline]);
    render(TestedEventScheduler);
    expect(screen.getAllByRole('article')[0]).toHaveTextContent('Published practice');
    expect(screen.queryByLabelText('Status')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByLabelText('Status')).toBeVisible();
  });
  it('requires deliberate confirmation and sends an audited publish transition', async () => {
    backendMocks.updateEvent.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      operationId: 'operation-1',
      requestId: 'request-1',
      id: 'event-1',
      updatedCount: 1,
    });
    render(TestedEventScheduler);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const editor = screen.getByRole('dialog', { name: 'Edit Event' });
    await fireEvent.change(within(editor).getByLabelText('Status'), {
      target: { value: 'published' },
    });

    expect(
      screen.getByText(
        'Publishing makes the event visible to its configured audience.',
      ),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', {
      name: 'Save Event Changes',
    });
    expect(save).toBeDisabled();

    await fireEvent.input(screen.getByLabelText(/Type PUBLISH EVENT/), {
      target: { value: 'PUBLISH EVENT' },
    });
    expect(save).toBeEnabled();
    await fireEvent.click(save);

    await waitFor(() => {
      expect(backendMocks.updateEvent).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.updateEvent).toHaveBeenCalledWith(
      'fixture-tenant',
      'event-1',
      expect.objectContaining({
        title: 'Opening practice',
        teamId: 'team-1',
        lifecycleStatus: 'published',
        applyToSeries: false,
      }),
      'Event updated from CRM.',
      expect.stringContaining('event-update:'),
    );
  });
});
