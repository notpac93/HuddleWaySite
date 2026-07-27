import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    seasonsStore: writable([
      {
        id: 'spring-season',
        name: 'Spring Season',
        startDate: '2026-03-08',
        endDate: '2026-03-15',
      },
    ]),
  };
});

import RecurrenceSelectorHarness from '../fixtures/RecurrenceSelectorHarness.svelte';

const TestedRecurrenceSelectorHarness =
  RecurrenceSelectorHarness as unknown as Component;

function selectedDates() {
  return screen.getByRole('status', {
    name: 'selected recurrence dates',
  });
}

describe('RecurrenceSelector local calendar boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes the weekly end date across the Los Angeles spring DST boundary', async () => {
    vi.setSystemTime(new Date('2026-03-07T12:00:00-08:00'));
    render(TestedRecurrenceSelectorHarness);

    await fireEvent.input(screen.getByLabelText('End Date'), {
      target: { value: '2026-03-15' },
    });
    await fireEvent.click(screen.getByLabelText('Sunday'));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply Rule' }));

    expect(selectedDates()).toHaveTextContent('2026-03-08,2026-03-15');
  });

  it('keeps bi-weekly cadence across the Los Angeles spring DST boundary', async () => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00-08:00'));
    render(TestedRecurrenceSelectorHarness);

    await fireEvent.change(screen.getByLabelText('Pattern'), {
      target: { value: 'bi-weekly' },
    });
    await fireEvent.input(screen.getByLabelText('End Date'), {
      target: { value: '2026-03-15' },
    });
    await fireEvent.click(screen.getByLabelText('Sunday'));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply Rule' }));

    expect(selectedDates()).toHaveTextContent('2026-03-01,2026-03-15');
    expect(selectedDates()).not.toHaveTextContent('2026-03-08');
  });

  it('includes both local season boundary dates', async () => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00-08:00'));
    render(TestedRecurrenceSelectorHarness);

    await fireEvent.change(screen.getByLabelText('Pattern'), {
      target: { value: 'season' },
    });
    await fireEvent.change(screen.getByLabelText('Select Season'), {
      target: { value: 'spring-season' },
    });
    await fireEvent.click(screen.getByLabelText('Sunday'));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply Rule' }));

    expect(selectedDates()).toHaveTextContent('2026-03-08,2026-03-15');
  });
});
