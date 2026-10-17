import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  financialOverview: vi.fn(),
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
    mocks.financialOverview.mockReset().mockResolvedValue(overview());
    mocks.billingPackages.mockResolvedValue([]);
    roles.set('owner');
    tenantIdStore.set('tenant-a');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('shows human finance rows without exposing opaque identifiers', async () => {
    render(Tested);
    expect(await screen.findByText('Bank deposit')).toBeVisible();
    expect(screen.getAllByText('$123.45')).toHaveLength(2);
    expect(screen.queryByText('opaque-1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
  });

  it('keeps filters collapsed and updates records without resetting a search', async () => {
    render(Tested);
    await screen.findByText('Bank deposit');
    expect(screen.queryByRole('button', { name: /^Refresh$/ })).toBeNull();
    expect(screen.getByText('Search & filters').closest('details')).not.toHaveAttribute('open');
    await fireEvent.click(screen.getByText('Search & filters'));
    // jsdom does not implement the details default toggle.
    screen.getByText('Search & filters').closest('details')!.open = true;
    const search = screen.getByRole('searchbox');
    await fireEvent.input(search, { target: { value: 'Bank' } });
    const updated = overview(); updated.operations.views.deposits[0].amountCents = 20000;
    mocks.financialOverview.mockResolvedValue(updated);
    await refreshActiveData('pull');
    await waitFor(() => expect(screen.getAllByText('$200.00')).toHaveLength(2));
    expect(search).toHaveValue('Bank');
  });

  it('rejects stale tenant responses during a background update', async () => {
    render(Tested); await screen.findByText('Bank deposit');
    let finish!: (result: ReturnType<typeof overview>) => void;
    mocks.financialOverview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = refreshActiveData('pull'); await Promise.resolve();
    const next = overview(); next.operations.views.deposits[0].label = 'Tenant B deposit';
    mocks.financialOverview.mockResolvedValue(next);
    tenantIdStore.set('tenant-b');
    await screen.findByText('Tenant B deposit');
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
    await screen.findByText('Bank deposit');
    await fireEvent.click(screen.getByRole('button', { name: 'Payment setup' }));
    expect(await screen.findByRole('heading', { name: 'Payment setup' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add payment setup' })).toBeVisible();
  });
});
