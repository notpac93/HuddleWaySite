import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackendApiError,
  type DirectInvoiceRecord,
  type FinancialOverview,
} from '../../src/lib/api/BackendApi';

const backendMocks = vi.hoisted(() => ({
  financialOverview: vi.fn(),
  directInvoicePage: vi.fn(),
  createCrmExport: vi.fn(),
  financialPeriods: vi.fn(),
  previewFinancialPeriod: vi.fn(),
  closeFinancialPeriod: vi.fn(),
  reopenFinancialPeriod: vi.fn(),
  directInvoiceLedger: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable<string | null>('tenant-a'),
    activeTenantRole: writable<string | null>('owner'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import {
  activeTenantRole,
  tenantIdStore,
} from '../../src/lib/authStore';
import Financials from '../../src/components/crm/Financials.svelte';

const TestedFinancials = Financials as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const roles = activeTenantRole as Writable<string | null>;

function overview(tenantId = 'tenant-a'): FinancialOverview {
  return {
    tenantId,
    transactions: [],
    refunds: [],
    invoices: [],
    deposits: [],
    recordCounts: {
      transactions: 0,
      payments: 0,
      refunds: 0,
      invoices: 0,
      deposits: 0,
    },
    tracking: {
      complete: true,
      unreconciledTransactionCount: 0,
      unreconciledDepositCount: 0,
      sourceCollections: [
        'transactions',
        'payments',
        'refunds',
        'invoices',
        'deposits',
      ],
    },
    truncated: {
      transactions: false,
      refunds: false,
      invoices: false,
      deposits: false,
    },
    requestId: `overview-${tenantId}`,
  };
}

function invoice(
  id: string,
  overrides: Partial<DirectInvoiceRecord> = {},
): DirectInvoiceRecord {
  return {
    id,
    invoiceNumber: `HW-${id}`,
    title: `Program fee ${id}`,
    memo: null,
    status: 'open',
    agingBucket: 'not_due',
    recipientUid: `member-${id}`,
    recipientName: `Parent ${id}`,
    recipientEmail: `${id}@example.test`,
    lineItems: [
      {
        id: `line-${id}`,
        description: 'Program fee',
        quantity: 1,
        unitAmountCents: 12_500,
        amountCents: 12_500,
      },
    ],
    currency: 'USD',
    subtotalCents: 12_500,
    discountCents: 0,
    taxRateBps: 0,
    taxCents: 0,
    totalCents: 12_500,
    amountPaidCents: 0,
    amountRefundedCents: 0,
    amountDueCents: 12_500,
    dueAt: '2026-08-26T00:00:00.000Z',
    issuedAt: '2026-07-26T00:00:00.000Z',
    paidAt: null,
    voidedAt: null,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    hostedInvoiceUrl: `https://invoice.example.test/${id}`,
    invoicePdfUrl: null,
    stripeInvoiceId: `stripe-${id}`,
    reminderCount: 0,
    manualPaymentCount: 0,
    refundCount: 0,
    lastPaymentAt: null,
    lastRefundAt: null,
    issueError: null,
    ...overrides,
  };
}

function invoicePage(
  invoices: DirectInvoiceRecord[],
  tenantId = 'tenant-a',
) {
  return {
    tenantId,
    invoices,
    hasMore: false,
    nextCursor: null,
    truncated: false,
    limit: 200,
    requestId: `invoice-page-${tenantId}`,
  };
}

describe('Financials projection and controls', () => {
  beforeEach(() => {
    for (const mock of Object.values(backendMocks)) mock.mockReset();
    tenants.set('tenant-a');
    roles.set('owner');
    window.history.replaceState({}, '', '/admin/crm?financeView=Invoices');
    localStorage.clear();
    backendMocks.financialOverview.mockResolvedValue(overview());
    backendMocks.directInvoicePage.mockResolvedValue(
      invoicePage([invoice('invoice-1'), invoice('invoice-2')]),
    );
    backendMocks.financialPeriods.mockResolvedValue({
      tenantId: 'tenant-a',
      periods: [],
      truncated: false,
      limit: 100,
      requestId: 'periods-request',
    });
  });

  it('does not request financial records for a viewer and loads when owner authorization arrives', async () => {
    roles.set('viewer');
    render(TestedFinancials);

    expect(
      screen.getByRole('heading', { name: 'Owner permission required' }),
    ).toBeInTheDocument();
    expect(backendMocks.financialOverview).not.toHaveBeenCalled();
    expect(backendMocks.directInvoicePage).not.toHaveBeenCalled();

    roles.set('owner');
    expect(await screen.findByText('HW-invoice-1')).toBeInTheDocument();
    expect(backendMocks.financialOverview).toHaveBeenCalledWith('tenant-a');
    expect(backendMocks.directInvoicePage).toHaveBeenCalledWith(
      'tenant-a',
      { limit: 200, cursor: undefined },
    );
  });

  it('retains the current projection during refresh and ignores the old tenant result', async () => {
    const pendingOverview = Promise.withResolvers<FinancialOverview>();
    const pendingInvoices =
      Promise.withResolvers<ReturnType<typeof invoicePage>>();
    backendMocks.financialOverview
      .mockResolvedValueOnce(overview())
      .mockReturnValueOnce(pendingOverview.promise)
      .mockResolvedValue(overview('tenant-b'));
    backendMocks.directInvoicePage
      .mockResolvedValueOnce(invoicePage([invoice('invoice-1')]))
      .mockReturnValueOnce(pendingInvoices.promise)
      .mockResolvedValue(
        invoicePage([invoice('invoice-b')], 'tenant-b'),
      );

    render(TestedFinancials);
    expect(await screen.findByText('HW-invoice-1')).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Refresh' }),
    );
    expect(screen.getByText('HW-invoice-1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refreshing…' }),
    ).toBeDisabled();

    tenants.set('tenant-b');
    await waitFor(() => {
      expect(backendMocks.financialOverview).toHaveBeenCalledTimes(3);
      expect(backendMocks.directInvoicePage).toHaveBeenCalledTimes(3);
    });
    pendingOverview.resolve(overview('tenant-a'));
    pendingInvoices.resolve(invoicePage([invoice('stale')]));

    expect(await screen.findByText('HW-invoice-b')).toBeInTheDocument();
    expect(screen.queryByText('HW-stale')).not.toBeInTheDocument();
  });

  it('uses support-safe load errors and recovers through the retry control', async () => {
    backendMocks.financialOverview
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Private database diagnostic',
          status: 500,
          requestId: 'financial-request',
        }),
      )
      .mockResolvedValueOnce(overview());

    render(TestedFinancials);
    expect(
      await screen.findByText(/Financial records could not be loaded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Support request: financial-request/i))
      .toBeInTheDocument();
    expect(screen.queryByText('Private database diagnostic'))
      .not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('HW-invoice-1')).toBeInTheDocument();
  });

  it('exports exact selected ids with stable retries, rotates changed scope, and suppresses stale downloads', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const createObjectUrl = vi.fn(() => 'blob:financial-export');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    backendMocks.createCrmExport
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Private export worker detail',
          status: 503,
          requestId: 'export-request',
        }),
      )
      .mockResolvedValueOnce({
        exportId: 'export-1',
        resourceId: 'invoices',
        rowCount: 1,
        checksum: 'checksum-1',
        csvBase64: btoa('invoiceNumber\nHW-invoice-1\n'),
      })
      .mockResolvedValueOnce({
        exportId: 'export-2',
        resourceId: 'invoices',
        rowCount: 2,
        checksum: 'checksum-2',
        csvBase64: btoa('invoiceNumber\nHW-invoice-1\nHW-invoice-2\n'),
      });

    render(TestedFinancials);
    await screen.findByText('HW-invoice-1');
    await fireEvent.click(screen.getByLabelText('Select HW-invoice-1'));
    const exportButton = screen.getByRole('button', {
      name: 'Export',
    });
    await fireEvent.click(exportButton);
    expect(
      await screen.findByText(/The invoice export could not be created/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Support request: export-request/i))
      .toBeInTheDocument();
    expect(screen.queryByText('Private export worker detail'))
      .not.toBeInTheDocument();
    const firstKey = backendMocks.createCrmExport.mock.calls[0][1];
    expect(backendMocks.createCrmExport.mock.calls[0][0].selection)
      .toEqual({ scope: 'explicit', ids: ['invoice-1'] });

    await fireEvent.click(exportButton);
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(backendMocks.createCrmExport.mock.calls[1][1]).toBe(firstKey);

    await fireEvent.click(screen.getByLabelText('Select HW-invoice-2'));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Export' }),
    );
    await waitFor(() =>
      expect(backendMocks.createCrmExport).toHaveBeenCalledTimes(3),
    );
    expect(backendMocks.createCrmExport.mock.calls[2][0].selection)
      .toEqual({
        scope: 'explicit',
        ids: ['invoice-1', 'invoice-2'],
      });
    expect(backendMocks.createCrmExport.mock.calls[2][1]).not.toBe(firstKey);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('closes invoice details and clears direct-invoice scope when a team is selected', async () => {
    const view = render(TestedFinancials, { activeTeam: null });
    await screen.findByText('HW-invoice-1');
    await fireEvent.click(
      screen.getAllByRole('button', { name: 'View' })[0],
    );
    expect(
      screen.getByRole('dialog', { name: 'HW-invoice-2' }),
    ).toBeInTheDocument();

    await view.rerender({
      activeTeam: { id: 'team-1', name: 'Falcons' },
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/Direct invoices, refunds, disputes, and payouts/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('HW-invoice-1')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create' }),
    ).toBeDisabled();
  });

  it('wires pagination, page selection, columns, search, status, and URL-backed sorting', async () => {
    const records = Array.from({ length: 30 }, (_, index) =>
      invoice(`invoice-${String(index + 1).padStart(2, '0')}`, {
        status: index % 2 === 0 ? 'open' : 'paid',
        amountPaidCents: index % 2 === 0 ? 0 : 12_500,
        amountDueCents: index % 2 === 0 ? 12_500 : 0,
        createdAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    backendMocks.directInvoicePage.mockResolvedValue(invoicePage(records));
    render(TestedFinancials);

    expect(await screen.findByText(/^30 records$/i))
      .toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
    await fireEvent.click(
      screen.getByLabelText('Select every row on this page'),
    );
    expect(
      screen.getByRole('button', { name: 'Export' }),
    ).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await fireEvent.click(screen.getByText('Columns'));
    const partyColumnToggle = screen.getByRole('checkbox', {
      name: 'Party / source',
    });
    await fireEvent.click(partyColumnToggle);
    expect(
      screen.queryByRole('columnheader', { name: 'Party / source' }),
    ).not.toBeInTheDocument();

    await fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'paid' },
    });
    expect(await screen.findByText(/^15 records$/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1 · 0 selected/i))
      .toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get('financeStatus'))
      .toBe('paid');

    await fireEvent.input(screen.getByLabelText('Search loaded records'), {
      target: { value: 'invoice-02' },
    });
    expect(await screen.findByText(/^1 record$/i))
      .toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText(/^30 records$/i))
      .toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /^Record/ }));
    expect(new URL(window.location.href).searchParams.get('financeView'))
      .toBe('Invoices');
  });

  it('saves, applies, and deletes tenant-local views without crashing when browser storage rejects a write', async () => {
    render(TestedFinancials);
    await screen.findByText('HW-invoice-1');
    await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'open' },
    });
    await fireEvent.input(
      screen.getByLabelText('Save current filters locally'),
      { target: { value: 'Open invoices' } },
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText(/View saved in this browser/i),
    ).toBeInTheDocument();

    await fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: '' },
    });
    await fireEvent.change(screen.getByLabelText('Local saved view'), {
      target: { value: 'Open invoices' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('combobox', { name: 'Status' }))
      .toHaveValue('open');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Deleted local view “Open invoices”/i))
      .toBeInTheDocument();

    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage blocked', 'QuotaExceededError');
      });
    await fireEvent.input(
      screen.getByLabelText('Save current filters locally'),
      { target: { value: 'Blocked view' } },
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      screen.getByText(/could not be saved in this browser/i),
    ).toBeInTheDocument();
    storageWrite.mockRestore();
  });
});
