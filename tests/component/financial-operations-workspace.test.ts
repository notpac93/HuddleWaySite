import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  financialOverview: vi.fn(),
  refundTransaction: vi.fn(),
  billingPackages: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
    activeTenantRole: writable('owner'),
  };
});
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: mocks }));
vi.mock('../../src/lib/api/BillingOperationsApi', () => ({
  billingOperationsApi: mocks,
}));
vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return { seasonsStore: writable([]), teamsStore: writable([]) };
});

import FinancialOperationsWorkspace from '../../src/components/crm/FinancialOperationsWorkspace.svelte';
import { refreshActiveData } from '../../src/lib/crm/liveRefresh';
import { activeTenantRole, tenantIdStore } from '../../src/lib/authStore';
import type { Writable } from 'svelte/store';

const Tested = FinancialOperationsWorkspace as unknown as Component;
const roles = activeTenantRole as Writable<'owner' | 'editor' | null>;

function overview(complete = true) {
  return {
    operations: {
      complete,
      generatedAt: '2026-08-27T12:00:00.000Z',
      timeZone: 'America/Los_Angeles',
      reconciliation: {
        complete: true,
        unreconciledTransactionCount: 0,
        unreconciledDepositCount: 0,
        currencyIntegrityErrorCount: 0,
      },
      views: {
        deposits: [{
          key: 'opaque-1',
          kind: 'deposit',
          label: 'Bank deposit',
          context: 'August program fees',
          amountCents: 12345,
          currency: 'USD',
          status: 'paid',
          statusLabel: 'Paid',
          date: '2026-08-26',
          dateLabel: 'Aug 26, 2026',
          detail: '',
        }],
        transactions: [],
        scheduled: [],
        overdue: [],
        invoices: [],
      },
    },
  };
}

describe('dedicated CRM financial operations', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mocks.financialOverview.mockReset().mockResolvedValue(overview());
    mocks.billingPackages.mockResolvedValue([]);
    mocks.refundTransaction.mockReset().mockResolvedValue({ success: true });
    roles.set('owner');
    tenantIdStore.set('tenant-a');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  async function deposits() {
    await screen.findByRole('heading', { name: 'Overview' });
    await fireEvent.click(screen.getByRole('button', { name: 'Deposits' }));
    return await screen.findByRole('table');
  }

  it('opens Overview first and shows human finance rows without exposing opaque identifiers', async () => {
    render(Tested);
    const table = await deposits();
    expect(within(table).getByText('Bank deposit')).toBeVisible();
    expect(within(table).getByText('$123.45')).toBeVisible();
    expect(screen.queryByText('opaque-1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
  });

  it('updates records without resetting a search', async () => {
    render(Tested);
    const table = await deposits();
    const search = screen.getByRole('searchbox');
    await fireEvent.input(search, { target: { value: 'Bank' } });
    const updated = overview(); updated.operations.views.deposits[0].amountCents = 20000;
    mocks.financialOverview.mockResolvedValue(updated);
    await refreshActiveData('pull');
    await waitFor(() => expect(within(table).getByText('$200.00')).toBeVisible());
    expect(search).toHaveValue('Bank');
  });

  it('rejects stale tenant responses during a background update', async () => {
    render(Tested); await deposits();
    let finish!: (result: ReturnType<typeof overview>) => void;
    mocks.financialOverview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = refreshActiveData('pull'); await Promise.resolve();
    const next = overview(); next.operations.views.deposits[0].label = 'Tenant B deposit';
    mocks.financialOverview.mockResolvedValue(next);
    tenantIdStore.set('tenant-b');
    await screen.findAllByText('Tenant B deposit');
    finish(overview()); await pending;
    expect(screen.queryByText('Bank deposit')).toBeNull();
  });

  it('does not fetch owner finance data for an editor', async () => {
    roles.set('editor');
    render(Tested);
    expect(await screen.findByText('Owner permission required')).toBeVisible();
    await waitFor(() => expect(mocks.financialOverview).not.toHaveBeenCalled());
  });

  it('switches to payment setup without mixing it into ledger rows', async () => {
    render(Tested);
    await screen.findByRole('heading', { name: 'Overview' });
    await fireEvent.click(screen.getByRole('button', { name: 'Payment setup' }));
    expect(await screen.findByRole('heading', { name: 'Payment setup' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add payment setup' })).toBeVisible();
  });

  it('opens a full record and preserves the list search when going back', async () => {
    const result = overview();
    result.operations.views.deposits[0].label = 'Alexandra Montgomery-Williams';
    result.operations.views.deposits[0].detail = 'October membership deposit';
    mocks.financialOverview.mockResolvedValue(result);
    render(Tested);
    const table = await deposits();
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'Alexandra' } });
    await fireEvent.click(within(table).getByRole('button', { name: 'Alexandra Montgomery-Williams' }));
    expect(screen.getByRole('heading', { name: 'Alexandra Montgomery-Williams' })).toBeVisible();
    expect(screen.getByText('October membership deposit')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: /Back to Deposits/ }));
    expect(screen.getByRole('searchbox')).toHaveValue('Alexandra');
    await fireEvent.click(screen.getByRole('button', { name: 'Transactions' }));
    expect(window.location.search).toContain('financeView=transactions');
  });

  it('does not display a partial visible total when one amount is unknown', async () => {
    const result = overview();
    result.operations.views.deposits.push({ ...result.operations.views.deposits[0], key: 'unknown', label: 'Pending accounting', amountCents: null as unknown as number });
    mocks.financialOverview.mockResolvedValue(result);
    render(Tested);
    await deposits();
    await screen.findAllByText('Pending accounting');
    const total = screen.getByText('Visible total').querySelector('strong');
    expect(total).toHaveTextContent('Unavailable');
  });

  it('confirms a partial refund using the existing operation endpoint', async () => {
    const result = overview();
    const payment = {
      ...result.operations.views.deposits[0],
      kind: 'transaction', label: 'Maya Thompson', transactionId: 'transaction-1',
      refundableCents: 10000, status: 'succeeded',
    };
    const views = result.operations.views as Omit<typeof result.operations.views, 'transactions'> & { transactions: typeof payment[] };
    views.transactions = [payment];
    mocks.financialOverview.mockResolvedValue(result);
    render(Tested);
    await fireEvent.click(await screen.findByRole('button', { name: /Maya Thompson/ }));
    const dialog = document.querySelector('dialog')!;
    if (!dialog.showModal) dialog.showModal = () => dialog.setAttribute('open', '');
    if (!dialog.close) dialog.close = () => dialog.removeAttribute('open');
    await fireEvent.click(screen.getByRole('button', { name: /^Refund$/ }));
    const input = within(dialog).getByRole('spinbutton', { name: 'Amount (USD)' });
    expect(input).toHaveValue(100);
    expect(within(dialog).queryByText('Refund reason')).not.toBeInTheDocument();
    await fireEvent.input(input, { target: { value: '25.50' } });
    await fireEvent.submit(dialog.querySelector('form')!);
    expect(mocks.refundTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', transactionId: 'transaction-1', amountCents: 2550,
      note: 'Confirmed by the program owner in Financials.', idempotencyKey: expect.any(String),
    }));
  });

});
