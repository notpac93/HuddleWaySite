import { act, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataMocks = vi.hoisted(() => ({
  getRegistrationFormFinancials: vi.fn(),
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    DataStore: {
      getRegistrationFormFinancials:
        dataMocks.getRegistrationFormFinancials,
    },
    transactionsStore: writable([]),
    invoicesStore: writable([]),
    refundsStore: writable([]),
    eventsStore: writable([]),
  };
});

import {
  transactionsStore,
} from '../../src/lib/services/DataStore';
import FormsTable from '../../src/components/crm/registration/FormsTable.svelte';

const TestedFormsTable = FormsTable as unknown as Component;
const transactions = transactionsStore as Writable<unknown[]>;

describe('Registration form financial summaries', () => {
  beforeEach(() => {
    transactions.set([]);
    dataMocks.getRegistrationFormFinancials.mockReset();
  });

  it('reacts when the authoritative financial projection finishes loading', async () => {
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 0,
      totalBalance: 0,
      totalsAvailable: false,
      currency: null,
      financialRecordCount: 0,
      scopeReason: 'Financial projection is loading.',
    });
    render(TestedFormsTable, {
      forms: [{
        id: 'form-1',
        name: 'Fall Registration',
        status: 'Open',
        dateCreated: new Date('2026-07-01T12:00:00.000Z'),
        program: 'Program-wide',
      }],
      isLoadingForms: false,
      activeTab: 'Active',
    });

    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);

    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 45_000,
      totalBalance: 0,
      totalsAvailable: true,
      currency: 'USD',
      financialRecordCount: 30,
      scopeReason: 'Complete scoped projection.',
    });
    await act(() => transactions.set([{ id: 'transaction-1' }]));

    expect(screen.getAllByText('$450.00')[0]).toBeVisible();
    expect(screen.getAllByText('$0.00')[0]).toBeVisible();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
