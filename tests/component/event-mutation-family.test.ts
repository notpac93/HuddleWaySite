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
  createEventSeries: vi.fn(),
  duplicateEvent: vi.fn(),
  updateEvent: vi.fn(),
  uploadImageAsset: vi.fn(),
  publishImageAsset: vi.fn(),
}));

const registrationOutreachMocks = vi.hoisted(() => ({
  createShareableLink: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

vi.mock('../../src/lib/api/RegistrationOutreachApi', () => ({
  registrationOutreachApi: registrationOutreachMocks,
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  const scope = {
    limit: 500,
    truncated: false,
    loading: false,
    error: '',
    permissionDenied: false,
  };
  return {
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
        isDeleted: false,
        teamId: 'team-1',
        eventSeriesId: 'series-1',
        isMultiDateSeries: false,
        registrationFormId: 'form-1',
      },
    ]),
    registrationsStore: writable([]),
    seasonsStore: writable([]),
    teamsStore: writable([{ id: 'team-1', name: 'Tigers' }]),
    eventsProjectionScope: writable(scope),
    registrationsProjectionScope: writable(scope),
    teamsProjectionScope: writable(scope),
  };
});

vi.mock('../../src/lib/services/RegistrationService', () => ({
      RegistrationService: {
      subscribeToForms: vi.fn((
        _tenantId: string,
        onForms: (forms: unknown[]) => void,
        _onError: (error: unknown) => void,
      ) => {
        onForms([
          { id: 'form-1', title: 'Event registration', status: 'Open' },
          { id: 'form-2', title: 'Updated event registration', status: 'Open' },
        ]);
        return () => {};
      }),
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import {
  eventsProjectionScope,
  eventsStore,
  registrationsProjectionScope,
  registrationsStore,
} from '../../src/lib/services/DataStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import EventScheduler from '../../src/components/crm/EventScheduler.svelte';
import CreateEventForm from '../../src/components/crm/events/CreateEventForm.svelte';
import DuplicateEventModal from '../../src/components/crm/events/DuplicateEventModal.svelte';
import EditEventModal from '../../src/components/crm/events/EditEventModal.svelte';

const TestedCreateEventForm = CreateEventForm as unknown as Component;
const TestedDuplicateEventModal =
  DuplicateEventModal as unknown as Component;
const TestedEditEventModal = EditEventModal as unknown as Component;
const TestedEventScheduler = EventScheduler as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const eventRecords = eventsStore as Writable<any[]>;
const eventScope = eventsProjectionScope as Writable<any>;
const registrationRecords = registrationsStore as Writable<any[]>;
const registrationScope = registrationsProjectionScope as Writable<any>;
const healthyScope = {
  limit: 500,
  truncated: false,
  loading: false,
  error: '',
  permissionDenied: false,
};
const openingPractice = {
  id: 'event-1',
  title: 'Opening practice',
  date: '2030-08-10T16:00:00.000Z',
  endDate: '2030-08-10T18:00:00.000Z',
  dateKey: '2030-08-10',
  location: 'Field One',
  lifecycleStatus: 'draft',
  isDeleted: false,
  teamId: 'team-1',
  eventSeriesId: 'series-1',
  isMultiDateSeries: false,
  registrationFormId: 'form-1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function calendarLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

async function openInlineEditor() {
  await fireEvent.click(
    screen.getByRole('button', { name: 'Expand Opening practice' }),
  );
}

describe('event mutation family', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    eventRecords.set([openingPractice]);
    eventScope.set(healthyScope);
    registrationRecords.set([]);
    registrationScope.set(healthyScope);
    for (const mock of Object.values(backendMocks)) mock.mockReset();
    registrationOutreachMocks.createShareableLink.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates drafts with the exact backend contract and no rejected publishAt field', async () => {
    backendMocks.uploadImageAsset.mockResolvedValue({
      reservationId: `image_upload_${'a'.repeat(40)}`,
    });
    backendMocks.publishImageAsset.mockResolvedValue({ status: 'draft' });
    backendMocks.createEventSeries.mockResolvedValue({
      success: true,
      id: 'series-2',
      eventIds: ['event-2'],
    });
    render(TestedCreateEventForm);

    await fireEvent.input(screen.getByLabelText('Event Title'), {
      target: { value: '  Summer practice  ' },
    });
    const coverFile = new File(['image-bytes'], 'summer-practice.png', {
      type: 'image/png',
    });
    await fireEvent.change(screen.getByLabelText('Cover Image (Optional)'), {
      target: { files: [coverFile] },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save event drafts' }),
    );

    await waitFor(() => {
      expect(backendMocks.createEventSeries).toHaveBeenCalledTimes(1);
    });
    const [tenantId, data, reason, operationKey] =
      backendMocks.createEventSeries.mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(data).toMatchObject({
      teamId: 'team-1',
      title: 'Summer practice',
      type: 'Practice',
      publishMode: 'draft',
      imageReservationId: `image_upload_${'a'.repeat(40)}`,
    });
    expect(data.occurrences).toHaveLength(1);
    expect(data).not.toHaveProperty('publishAt');
    expect(reason).toBe('Event drafts created from CRM.');
    expect(operationKey).toContain('event-series-create:');
    expect(backendMocks.uploadImageAsset).toHaveBeenCalledWith(
      'tenant-a',
      coverFile,
      'event-cover',
      expect.stringContaining('event-cover-upload:'),
    );
    expect(backendMocks.publishImageAsset).toHaveBeenCalledWith(
      'tenant-a',
      `image_upload_${'a'.repeat(40)}`,
      'event',
      ['event-2'],
      'Bind the verified event cover to the created event series.',
      expect.stringMatching(/^event-cover-upload:.*:publish$/),
    );
  });

  it('shows the Events CSV import control and creates an audited draft', async () => {
    backendMocks.createEventSeries.mockResolvedValue({
      success: true,
      id: 'series-import-1',
      eventIds: ['event-import-1'],
    });
    render(TestedEventScheduler);

    const input = screen.getByLabelText('Import events CSV');
    expect(input).toHaveAttribute('accept', '.csv,text/csv');
    const file = new File([
      'title,date,start_time,end_time,team,registration_form_id,type,location\n'
      + 'Tryouts,2030-08-20,18:00,19:00,team-1,form-1,Tryout,Main Gym\n',
    ], 'tryouts.csv', { type: 'text/csv' });
    // jsdom's File does not implement the browser File.text() API used by the
    // import path, so supply the native-browser equivalent for this test.
    Object.defineProperty(file, 'text', {
      value: async () =>
        'title,date,start_time,end_time,team,registration_form_id,type,location\n'
        + 'Tryouts,2030-08-20,18:00,19:00,team-1,form-1,Tryout,Main Gym\n',
    });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(backendMocks.createEventSeries).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.createEventSeries).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        title: 'Tryouts',
        teamId: 'team-1',
        type: 'Tryout',
        location: 'Main Gym',
        publishMode: 'draft',
        occurrences: [expect.objectContaining({
          dateKey: '2030-08-20',
          startTime: '18:00',
          endTime: '19:00',
        })],
      }),
      'Event draft imported from CSV.',
      expect.stringMatching(/^crm-event-csv-import:/),
    );
    expect(await screen.findByText('1 event drafts created.')).toBeVisible();
  });

  it('creates a shareable registration link only for a live published registration', async () => {
    eventRecords.set([{
      ...openingPractice,
      lifecycleStatus: 'published',
      isVisible: true,
      isRegistrationEnabled: true,
    }]);
    registrationOutreachMocks.createShareableLink.mockResolvedValue({
      url: 'https://sports-team-apps.web.app/register?token=opaque-registration-token',
      expiresAt: '2030-08-10T18:00:00.000Z',
    });
    render(TestedEventScheduler);

    await openInlineEditor();
    await fireEvent.click(screen.getByRole('button', {
      name: 'Share Link',
    }));

    await waitFor(() => {
      expect(registrationOutreachMocks.createShareableLink).toHaveBeenCalledWith({
        tenantId: 'tenant-a',
        eventId: 'event-1',
        idempotencyKey: expect.stringMatching(/^event-shareable-registration-link:/),
      });
    });
    expect(screen.getByLabelText('Shareable registration link for Opening practice'))
      .toHaveValue('https://sports-team-apps.web.app/register?token=opaque-registration-token');
    expect(screen.getAllByRole('button', { name: 'Copy link' })[0]).toBeEnabled();
  });

  it('does not offer a shareable link before registration is published and live', async () => {
    render(TestedEventScheduler);

    await openInlineEditor();

    expect(screen.queryByRole('button', { name: 'Share Link' })).toBeNull();
    expect(screen.getByText('Publish this event before creating a registration link.'))
      .toBeVisible();
  });

  it('locks create controls and invalidates the response when tenant scope changes', async () => {
    const pending = deferred<void>();
    backendMocks.createEventSeries.mockReturnValue(pending.promise);
    render(TestedCreateEventForm);

    await fireEvent.input(screen.getByLabelText('Event Title'), {
      target: { value: 'Summer practice' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save event drafts' }),
    );

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(screen.queryByText('Reason for change')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Additional Notes (Optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      tenants.set('tenant-b');
      pending.resolve();
      await pending.promise;
    });
    expect(await screen.findByText(
      'The organization or event details changed while saving. Review the form and try again.',
    )).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Success!' })).toBeNull();
  });

  it('blocks duplicate time slots before creating event occurrences', async () => {
    render(TestedCreateEventForm);
    await fireEvent.input(screen.getByLabelText('Event Title'), {
      target: { value: 'Summer practice' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(
      screen.getByRole('button', { name: /Event Time/ }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: /Add another time/ }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText(
      'Select at least one event date and provide valid, unique event times.',
    )).toBeVisible();
    expect(backendMocks.createEventSeries).not.toHaveBeenCalled();
  });

  it('duplicates with the original end time, locks controls, and submits only once', async () => {
    const pending = deferred<void>();
    backendMocks.duplicateEvent.mockReturnValue(pending.promise);
    const start = new Date();
    start.setHours(16, 0, 0, 0);
    const end = new Date(start);
    end.setHours(17, 30, 0, 0);
    render(TestedDuplicateEventModal, {
      isOpen: true,
      event: {
        id: 'event-1',
        title: 'Opening practice',
        dateObj: start,
        endDateObj: end,
        dateKey: '1999-01-01',
        time: '4:00 PM',
        teamId: 'team-1',
      },
    });

    expect(screen.getByText('4:00 PM - 5:30 PM')).toBeVisible();
    expect(screen.queryByText(/Added dates are created as drafts/)).toBeNull();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Select specific days' }),
    );
    const selected = new Date();
    selected.setDate(Math.min(selected.getDate() + 1, 28));
    await fireEvent.click(
      screen.getByRole('button', { name: calendarLabel(selected) }),
    );
    const save = screen.getByRole('button', { name: 'Add Dates' });
    await fireEvent.click(save);
    await fireEvent.click(save);

    expect(backendMocks.duplicateEvent).toHaveBeenCalledTimes(1);
    expect(backendMocks.duplicateEvent).toHaveBeenCalledWith(
      'tenant-a',
      'event-1',
      [
        expect.objectContaining({
          startTime: '16:00',
          endTime: '17:30',
        }),
      ],
      'Event dates added from CRM.',
      expect.stringContaining('event-duplicate:'),
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.queryByText('Reason for change')).not.toBeInTheDocument();

    pending.resolve();
    await pending.promise;
  });

  it('masks edit failures and reuses the unchanged retry identity', async () => {
    backendMocks.updateEvent
      .mockRejectedValueOnce(new BackendApiError({
        message: 'raw event datastore failure',
        status: 503,
        code: 'event_write_failed',
        requestId: 'event-request-8',
      }))
      .mockResolvedValueOnce(undefined);
    render(TestedEditEventModal, {
      event: {
        id: 'event-1',
        title: 'Opening practice',
        dateObj: new Date('2030-08-10T16:00:00.000Z'),
        endDateObj: new Date('2030-08-10T18:00:00.000Z'),
        location: 'Field One',
        teamId: 'team-1',
        lifecycleStatus: 'draft',
        registrationFormId: 'form-1',
      },
      teams: { 'team-1': 'Tigers' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save Event Changes' }),
    );

    const failure = await screen.findByText(
      'The event could not be updated. Support request: event-request-8',
    );
    expect(failure).not.toHaveTextContent('raw event datastore failure');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry Event Update' }),
    );
    await waitFor(() => {
      expect(backendMocks.updateEvent).toHaveBeenCalledTimes(2);
    });
    expect(backendMocks.updateEvent.mock.calls[1][4])
      .toBe(backendMocks.updateEvent.mock.calls[0][4]);
  });

  it('requires deliberate confirmation before the full editor publishes', async () => {
    backendMocks.updateEvent.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      operationId: 'operation-publish-1',
      requestId: 'request-publish-1',
      id: 'event-1',
      updatedCount: 1,
    });
    render(TestedEditEventModal, {
      event: {
        id: 'event-1',
        title: 'Opening practice',
        dateObj: new Date('2030-08-10T16:00:00.000Z'),
        endDateObj: new Date('2030-08-10T18:00:00.000Z'),
        location: 'Field One',
        teamId: 'team-1',
        lifecycleStatus: 'draft',
        registrationFormId: 'form-1',
      },
      teams: { 'team-1': 'Tigers' },
    });

    await fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'published' },
    });
    const save = screen.getByRole('button', { name: 'Save Event Changes' });
    expect(save).toBeDisabled();
    expect(screen.getByText(
      'Publishing makes the event visible to its configured audience.',
    )).toBeVisible();

    await fireEvent.input(screen.getByLabelText(/Type PUBLISH EVENT/), {
      target: { value: 'PUBLISH EVENT' },
    });
    expect(save).toBeEnabled();
    await fireEvent.click(save);

    await waitFor(() => {
      expect(backendMocks.updateEvent).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.updateEvent).toHaveBeenCalledWith(
      'tenant-a',
      'event-1',
      expect.objectContaining({ lifecycleStatus: 'published' }),
      'Event updated from CRM.',
      expect.stringContaining('event-update:'),
    );
  });

  it('requires confirmation before changing an event registration form', async () => {
    backendMocks.updateEvent.mockResolvedValue({
      id: 'event-1',
      eventIds: ['event-1'],
      updatedCount: 1,
      publicationSyncStatus: 'not_required',
    });
    render(TestedEventScheduler);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.change(screen.getByLabelText('Registration Form *'), {
      target: { value: 'form-2' },
    });
    expect(screen.getByRole('button', { name: 'Confirm change' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Event Changes' })).toBeDisabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save Event Changes' }));
    await waitFor(() => expect(backendMocks.updateEvent).toHaveBeenCalledTimes(1));
    expect(backendMocks.updateEvent.mock.calls[0][2]).toEqual(
      expect.objectContaining({ registrationFormId: 'form-2' }),
    );
  });

  it('keeps missing schedule fields blank and refuses guessed dates or times', async () => {
    render(TestedEditEventModal, {
      event: {
        id: 'event-1',
        title: 'Incomplete event',
        location: '',
        teamId: 'team-1',
        lifecycleStatus: 'draft',
      },
      teams: { 'team-1': 'Tigers' },
    });
    expect(screen.getByLabelText('Date *')).toHaveValue('');
    expect(screen.getByLabelText('Time *')).toHaveValue('');
    expect(screen.getByLabelText('End time *')).toHaveValue('');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save Event Changes' }),
    );
    expect(await screen.findByText(
      'Event title, team, date, start time, and end time are required.',
    )).toBeVisible();
    expect(backendMocks.updateEvent).not.toHaveBeenCalled();
  });

  it('invalidates inline updates on scope change and never applies stale success', async () => {
    const pending = deferred<void>();
    backendMocks.updateEvent.mockReturnValue(pending.promise);
    render(TestedEventScheduler);
    await openInlineEditor();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save Event Changes' }),
    );

    expect(
      screen.getByRole('button', { name: 'Saving Changes...' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Event Title')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New event' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();

    await act(async () => {
      tenants.set('tenant-b');
      pending.resolve();
      await pending.promise;
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The organization or event details changed while saving.',
    );
    expect(screen.queryByRole('button', { name: 'Changes Saved' })).toBeNull();
  });

  it('omits identifier-less events and reports the malformed record', async () => {
    eventRecords.set([
      { ...openingPractice, id: '' },
      openingPractice,
    ]);
    render(TestedEventScheduler, { activeTeam: {} });
    expect(screen.getByText(
      '1 malformed event record was omitted because no stable identifier was available.',
    )).toBeVisible();
    expect(screen.getByText('Opening practice')).toBeVisible();
  });

  it('blocks a series update when the loaded event projection is truncated', async () => {
    eventRecords.set([
      { ...openingPractice, isMultiDateSeries: true },
    ]);
    eventScope.set({ ...healthyScope, truncated: true });
    render(TestedEventScheduler);
    await openInlineEditor();
    await fireEvent.click(
      screen.getByRole('checkbox', {
        name: /Apply to all events in this series/,
      }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save Event Changes' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Series updates require a complete series of at most 400 events.',
    );
    expect(backendMocks.updateEvent).not.toHaveBeenCalled();
  });

  it('marks the registrant modal incomplete instead of claiming an exact count', async () => {
    registrationScope.set({ ...healthyScope, truncated: true });
    render(TestedEventScheduler);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'View loaded registrants for Opening practice; participant list is limited',
      }),
    );
    expect(screen.getByRole('dialog', {
      name: 'Event Registrants',
    })).toBeVisible();
    expect(screen.getByText(
      'The registration projection is truncated. This loaded list is not a complete event roster.',
    )).toBeVisible();
    expect(screen.getByText('Opening practice • Count unavailable')).toBeVisible();
  });
});
