import { act, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataMocks = vi.hoisted(() => ({ getRegistrationFormFinancials: vi.fn() }));
vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return { DataStore: dataMocks, transactionsStore: writable([]), invoicesStore: writable([]), refundsStore: writable([]), eventsStore: writable([]) };
});
import { transactionsStore } from '../../src/lib/services/DataStore';
import FormsTable from '../../src/components/crm/registration/FormsTable.svelte';
const TestedFormsTable = FormsTable as unknown as Component;
const transactions = transactionsStore as Writable<unknown[]>;
const form = { id: 'form-1', name: 'Fall registration', status: 'Open', fields: [{ id:'name', label:'Name', type:'text' }] };

describe('Registration forms stay independent of owner-only financial summaries', () => {
  beforeEach(() => { transactions.set([]); dataMocks.getRegistrationFormFinancials.mockReset(); });
  it('keeps the compact library available while financial records change', async () => {
    render(TestedFormsTable, { forms: [form], isLoadingForms:false, activeTab:'Active' });
    expect(screen.getByRole('list', {name:'Registration forms'})).toHaveTextContent('Fall registration');
    await act(() => transactions.set([{id:'payment',grossAmount:45000,currency:'USD'}]));
    expect(screen.queryByText('$450.00')).toBeNull();
    expect(dataMocks.getRegistrationFormFinancials).not.toHaveBeenCalled();
  });
  it('opens a form by its stable identifier without financial loading or fabricated zero totals', async () => {
    const select=vi.fn();
    render(TestedFormsTable, { props: { forms:[form], isLoadingForms:false, activeTab:'Active' }, events: { select } });
    await fireEvent.click(screen.getByRole('button',{name:/Fall registration/}));
    expect(select.mock.calls[0][0].detail.id).toBe('form-1');
    expect(screen.queryByText('No financial activity')).toBeNull();
    expect(screen.queryByText('$0.00')).toBeNull();
  });
  it('shows a failed form load instead of an empty or financially unavailable list', () => {
    render(TestedFormsTable, { forms:[], isLoadingForms:false, activeTab:'Active', error:'Forms could not be loaded.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Forms could not be loaded.');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
