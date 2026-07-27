import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import DataTableHarness from '../fixtures/DataTableHarness.svelte';

const TestedDataTableHarness = DataTableHarness as unknown as Component;

describe('DataTable production interaction contract', () => {
  it('selects the current page by stable ID, preserves scope across pages, and clears after bulk mutation', async () => {
    const view = render(TestedDataTableHarness);
    const table = view.container.querySelector('table')!;

    await fireEvent.click(
      table.querySelector<HTMLInputElement>(
        'input[aria-label="Select all records on this page"]',
      )!,
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent(
      'row-1,row-2',
    );
    expect(screen.getByRole('button', { name: 'Export 2 selected' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.click(
      table.querySelector<HTMLInputElement>(
        'input[aria-label="Select all records on this page"]',
      )!,
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent(
      'row-1,row-2,row-3,row-4',
    );

    await fireEvent.click(
      screen.getByRole('button', { name: 'Complete bulk mutation' }),
    );
    expect(screen.getByLabelText('selected stable ids')).toHaveTextContent('');
    expect(screen.getByText('No records are available yet.')).toBeVisible();
  });

  it('opens and consumes a stable target on its sorted page after clearing filters', async () => {
    render(TestedDataTableHarness, {
      initialTarget: 'row-3',
      sortByAmount: true,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('consumed stable target')).toHaveTextContent(
        'row-3',
      );
    });
    // Amount ascending is 0, 10, 20, 30. row-3 is therefore on page one even
    // though it is the third record in the unsorted source array.
    expect(screen.getByText('Page 1 of 2')).toBeVisible();
  });

  it('distinguishes loading, permission, error, empty, and no-results states', async () => {
    const loadingView = render(TestedDataTableHarness, { loading: true });
    expect(screen.getByText('Loading records…')).toBeVisible();
    loadingView.unmount();

    const deniedView = render(TestedDataTableHarness, { permissionDenied: true });
    expect(
      screen.getByText('You do not have permission to view these records.'),
    ).toBeVisible();
    deniedView.unmount();

    const errorView = render(TestedDataTableHarness, {
      error: 'Records failed safely.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Records failed safely.');
    errorView.unmount();

    render(TestedDataTableHarness);
    await fireEvent.input(screen.getByLabelText('Search table records'), {
      target: { value: 'not-a-record' },
    });
    expect(
      screen.getByText('No records match the current search or filters.'),
    ).toBeVisible();
  });
});
