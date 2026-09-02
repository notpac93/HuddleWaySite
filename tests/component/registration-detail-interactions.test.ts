import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataMocks = vi.hoisted(() => ({
  getRegistrationFormFinancials: vi.fn(),
  getUserFinancialsForEvents: vi.fn(),
  downloadCsv: vi.fn(),
}));
const mutationMocks = vi.hoisted(() => ({
  updateRegistrationForm: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: mutationMocks,
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    DataStore: {
      getRegistrationFormFinancials:
        dataMocks.getRegistrationFormFinancials,
      getUserFinancialsForEvents:
        dataMocks.getUserFinancialsForEvents,
    },
    transactionsStore: writable([]),
    invoicesStore: writable([]),
    refundsStore: writable([]),
    eventsStore: writable([]),
  };
});

vi.mock('../../src/lib/ui/csvExport', () => ({
  downloadCsv: dataMocks.downloadCsv,
}));

import RegistrationDetail from '../../src/components/crm/registration/RegistrationDetail.svelte';

const TestedRegistrationDetail =
  RegistrationDetail as unknown as Component;

const selectedForm = {
  id: 'form-1',
  name: 'Fall Registration',
  status: 'Open',
  program: '12U',
};

function participant(index: number) {
  return {
    id: `registration-${String(index).padStart(2, '0')}`,
    status: index === 11 ? 'Waitlisted' : 'Active',
    participantName: `Participant ${index}`,
    email: `participant-${index}@example.test`,
    userId: `user-${index}`,
    date: new Date(`2026-07-${String(index).padStart(2, '0')}T12:00:00.000Z`),
  };
}

describe('RegistrationDetail table interactions', () => {
  beforeEach(() => {
    dataMocks.downloadCsv.mockReset();
    dataMocks.getRegistrationFormFinancials.mockReset();
    dataMocks.getUserFinancialsForEvents.mockReset();
    mutationMocks.updateRegistrationForm.mockReset();
    mutationMocks.updateRegistrationForm.mockResolvedValue({ id: 'form-1' });
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 12_500,
      totalFees: 500,
      totalRefunds: 1_000,
      totalBalance: 2_500,
      totalsAvailable: true,
      currency: 'USD',
      financialRecordCount: 12,
      scopeReason: 'Loaded connected event scope.',
    });
    dataMocks.getUserFinancialsForEvents.mockImplementation(
      (userId: string) => ({
        paymentStatus: userId === 'user-2' ? 'Open Balance' : 'Paid',
      }),
    );
  });

  it('reviews connected-event impact and requires a reason before retiring', async () => {
    render(TestedRegistrationDetail, {
      tenantId: 'tenant-a',
      selectedForm,
      connectedEvents: [{ id: 'event-1', title: 'Fall League' }],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Retire form' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Retire form: Fall Registration',
    });
    expect(dialog).toHaveTextContent('1 connected event');
    expect(dialog).toHaveTextContent('Historical responses stay readable');
    const submit = within(dialog).getByRole('button', { name: 'Retire form' });
    expect(submit).toBeDisabled();
    await fireEvent.input(within(dialog).getByLabelText(/Reason for lifecycle change/), {
      target: { value: 'Season registration has closed.' },
    });
    await fireEvent.click(within(dialog).getByRole('checkbox'));
    await fireEvent.click(submit);

    expect(mutationMocks.updateRegistrationForm).toHaveBeenCalledWith(
      'tenant-a',
      'form-1',
      expect.objectContaining({ status: 'archived' }),
      'Season registration has closed.',
      expect.stringMatching(/^registration-form-lifecycle:/),
    );
    expect(await screen.findByText(/Registration form retired/)).toBeVisible();
  });

  it('paginates stable IDs, exports selected rows, and clears hidden selection on search', async () => {
    const participants = Array.from({ length: 12 }, (_, index) =>
      participant(index + 1),
    );
    render(TestedRegistrationDetail, {
      selectedForm,
      participants,
      connectedEvents: [{
        id: 'event-1',
        title: 'Fall League',
        type: 'League',
        date: '2026-09-01T12:00:00.000Z',
        currency: 'USD',
        priceCents: 12_500,
      }],
    });

    expect(
      screen.getByRole('button', {
        name: 'Back to registration forms',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Registration Form' })).toBeVisible();
    expect(screen.queryByText('Registration ID')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by participant name or email')).toBeVisible();
    expect(screen.getAllByText('$125.00')).toHaveLength(2);
    expect(screen.getByText(/9\/1\/2026/)).toBeVisible();
    expect(screen.getByText('1 - 10 of 12')).toBeVisible();

    await fireEvent.click(
      screen.getByLabelText('Select all participants on this page'),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(dataMocks.downloadCsv).toHaveBeenCalledTimes(1);
    expect(dataMocks.downloadCsv.mock.calls[0][0]).toHaveLength(10);
    expect(dataMocks.downloadCsv.mock.calls[0][0][0]).toMatchObject({
      registrationId: 'registration-01',
      participant: 'Participant 1',
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('11 - 12 of 12')).toBeVisible();
    expect(
      screen.getByLabelText('Select Participant 11'),
    ).not.toBeChecked();

    await fireEvent.input(screen.getByLabelText('Search participants'), {
      target: { value: 'Participant 11' },
    });
    expect(screen.getByText('1 - 1 of 1')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(dataMocks.downloadCsv).toHaveBeenCalledTimes(2);
    expect(dataMocks.downloadCsv.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        registrationId: 'registration-11',
        participant: 'Participant 11',
      }),
    ]);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Clear search' }),
    );
    expect(screen.getByText('1 - 10 of 12')).toBeVisible();
  });

  it('labels incomplete scope, refuses derived payment labels, and tolerates a missing ID', () => {
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 0,
      totalFees: 0,
      totalRefunds: 0,
      totalBalance: 0,
      totalsAvailable: false,
      currency: null,
      financialRecordCount: 0,
      scopeReason: 'The connected-event projection is incomplete.',
    });
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [
        participant(1),
        {
          id: '',
          status: '',
          participantName: 'Malformed Registration',
          email: '',
          userId: '',
          date: null,
        },
      ],
      connectedEvents: [{
        id: 'event-1',
        title: 'Unpriced Event',
        type: 'Camp',
        date: 'not-a-date',
        currency: 'US dollars',
        priceCents: 10.5,
      }],
      participantsTruncated: true,
      eventsTruncated: true,
      limit: 500,
    });

    expect(screen.getByText(/Showing 2 loaded participants/)).toBeVisible();
    expect(screen.getByText(/Showing 1 connected event\./)).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(screen.getByText('Currency unavailable')).toBeVisible();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No financial activity')).toHaveLength(4);
    expect(
      screen.getByLabelText('Select Malformed Registration'),
    ).toBeDisabled();
    expect(
      dataMocks.getUserFinancialsForEvents,
    ).not.toHaveBeenCalled();
  });

  it('renders loading/error/empty states and disables empty export', () => {
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [],
      connectedEvents: [],
      isLoadingParticipants: true,
      error: 'Registration detail could not be loaded.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Registration detail could not be loaded.',
    );
    expect(screen.getByText('Loading participants...')).toBeVisible();
    expect(
      screen.getByText(
        'No events are currently using this registration form.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
