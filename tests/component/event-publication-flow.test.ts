import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

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

import EventScheduler from '../../src/components/crm/EventScheduler.svelte';

const TestedEventScheduler = EventScheduler as unknown as Component;

describe('event publication flow', () => {
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

    await fireEvent.click(
      screen.getByRole('button', { name: 'Expand Opening practice' }),
    );
    await fireEvent.change(screen.getByLabelText('Publish Status'), {
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
      'Event updated inline from CRM.',
      expect.stringContaining('event-inline-update:'),
    );
  });
});
