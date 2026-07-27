import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackendApiError,
  type DirectInvoiceRecord,
} from '../../src/lib/api/BackendApi';
import type { FinanceTableRow } from '../../src/lib/finance/crmFinancials';

const backendMocks = vi.hoisted(() => ({
  directInvoiceLedger: vi.fn(),
  recordManualPayment: vi.fn(),
  directInvoiceAction: vi.fn(),
  refundDirectInvoice: vi.fn(),
  refundTransaction: vi.fn(),
  createDirectInvoice: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import TransactionDetails from '../../src/components/crm/TransactionDetails.svelte';

const TestedTransactionDetails =
  TransactionDetails as unknown as Component;

function invoice(
  overrides: Partial<DirectInvoiceRecord> = {},
): DirectInvoiceRecord {
  return {
    id: 'invoice-1',
    invoiceNumber: 'HW-2026-0001',
    title: 'Program fee',
    memo: null,
    status: 'open',
    agingBucket: 'not_due',
    recipientUid: 'member-1',
    recipientName: 'Parent One',
    recipientEmail: 'parent@example.test',
    lineItems: [
      {
        id: 'line-1',
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
    hostedInvoiceUrl: 'https://invoice.example.test/one',
    invoicePdfUrl: null,
    stripeInvoiceId: 'in_fixture',
    reminderCount: 0,
    manualPaymentCount: 0,
    refundCount: 0,
    lastPaymentAt: null,
    lastRefundAt: null,
    issueError: null,
    ...overrides,
  };
}

function invoiceRow(record: DirectInvoiceRecord): FinanceTableRow {
  return {
    id: `direct_invoice:${record.id}`,
    recordId: record.id,
    kind: 'direct_invoice',
    dateIso: record.createdAt,
    dateLabel: '7/26/2026',
    recordLabel: record.invoiceNumber,
    partyLabel: record.recipientName || 'Recipient unavailable',
    contextLabel: record.title,
    status: record.status,
    currency: record.currency,
    primaryCents: record.totalCents,
    secondaryCents: record.amountDueCents,
    primaryLabel: 'Invoice total',
    secondaryLabel: 'Amount due',
    original: record as unknown as Record<string, unknown>,
  };
}

function transactionRow(
  overrides: Record<string, unknown> = {},
): FinanceTableRow {
  const original = {
    id: 'transaction-1',
    status: 'succeeded',
    grossAmount: 12_500,
    amountRefunded: 0,
    currency: 'USD',
    createdAt: '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
  const kind =
    original.status === 'disputed' ? 'dispute' as const : 'transaction' as const;
  return {
    id: `${kind}:transaction-1`,
    recordId: 'transaction-1',
    kind,
    dateIso: String(original.createdAt),
    dateLabel: '7/26/2026',
    recordLabel: 'transaction-1',
    partyLabel: 'Parent One',
    contextLabel: 'Card · Organization',
    status: String(original.status),
    currency: 'USD',
    primaryCents: 12_500,
    secondaryCents: 12_000,
    primaryLabel: 'Gross',
    secondaryLabel: 'Net',
    original,
  };
}

function ledger(record: DirectInvoiceRecord) {
  return {
    tenantId: 'fixture-tenant',
    invoice: record,
    events: [],
    payments: [],
    refunds: [],
    truncated: { events: false, payments: false, refunds: false },
    limits: { events: 100, payments: 100, refunds: 100 },
    requestId: 'ledger-request',
  };
}

describe('financial mutation drawer', () => {
  beforeEach(() => {
    for (const mock of Object.values(backendMocks)) mock.mockReset();
  });

  it('previews and submits an offline payment once with audit and idempotency evidence', async () => {
    const record = invoice();
    backendMocks.directInvoiceLedger.mockResolvedValue(ledger(record));
    backendMocks.recordManualPayment.mockResolvedValue(
      invoice({
        status: 'paid',
        amountPaidCents: 12_500,
        amountDueCents: 0,
        manualPaymentCount: 1,
      }),
    );

    render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });

    expect(
      await screen.findByRole('heading', { name: 'Ledger timeline' }),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Record offline payment' }),
    );

    const amount = screen.getByLabelText('Amount (USD)');
    expect(amount).toHaveValue('125.00');
    await fireEvent.input(
      screen.getByLabelText('Receipt or reference'),
      { target: { value: 'check-1042' } },
    );
    await fireEvent.input(
      screen.getByLabelText('Internal audit reason'),
      { target: { value: 'Record the check received at the front desk.' } },
    );
    await fireEvent.click(
      screen.getByLabelText(
        /I reviewed the amount, scope, status transition/i,
      ),
    );

    const confirm = screen.getByRole('button', {
      name: 'Confirm operation',
    });
    await fireEvent.click(confirm);
    await fireEvent.click(confirm);

    await waitFor(() => {
      expect(backendMocks.recordManualPayment).toHaveBeenCalledTimes(1);
    });
    expect(backendMocks.recordManualPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'fixture-tenant',
        invoiceId: 'invoice-1',
        amountCents: 12_500,
        method: 'check',
        reference: 'check-1042',
        note: 'Record the check received at the front desk.',
        auditReason: 'Record the check received at the front desk.',
        idempotencyKey: expect.stringContaining(
          'manual_payment-invoice-1:',
        ),
      }),
    );
    expect(
      await screen.findByText(
        'The operation was accepted by the authoritative backend.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Operation accepted' }),
    ).toBeDisabled();
  });

  it('loads the authoritative ledger for the prefixed table row id and reports truncation', async () => {
    const record = invoice();
    backendMocks.directInvoiceLedger.mockResolvedValue({
      ...ledger(record),
      events: [
        {
          id: 'event-1',
          type: 'manual_payment',
          status: 'succeeded',
          amountCents: 12_500,
          currency: 'USD',
          createdAt: '2026-07-27T00:00:00.000Z',
        },
      ],
      truncated: { events: true, payments: false, refunds: false },
      limits: { events: 1, payments: 100, refunds: 100 },
    });

    render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });

    expect(await screen.findByText('Manual Payment')).toBeInTheDocument();
    expect(
      screen.getByText(/This ledger is incomplete\. Limits: 1 events/i),
    ).toBeInTheDocument();
    expect(backendMocks.directInvoiceLedger).toHaveBeenCalledWith(
      'fixture-tenant',
      'invoice-1',
    );
  });

  it('keeps an idempotency key for an unchanged retry and rotates it when the payment payload changes', async () => {
    const record = invoice({ stripeInvoiceId: null });
    backendMocks.directInvoiceLedger.mockResolvedValue(ledger(record));
    backendMocks.recordManualPayment
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Sensitive gateway failure detail',
          status: 503,
          requestId: 'request-first',
        }),
      )
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Different sensitive failure detail',
          status: 503,
          requestId: 'request-second',
        }),
      )
      .mockResolvedValueOnce(
        invoice({
          stripeInvoiceId: null,
          status: 'partially_paid',
          amountPaidCents: 10_000,
          amountDueCents: 2_500,
        }),
      );

    render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });
    await screen.findByRole('heading', { name: 'Ledger timeline' });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Record offline payment' }),
    );
    await fireEvent.input(screen.getByLabelText('Receipt or reference'), {
      target: { value: 'receipt-1' },
    });
    await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
      target: { value: 'Received at the front desk.' },
    });
    await fireEvent.click(
      screen.getByLabelText(/I reviewed the amount, scope/i),
    );

    const confirm = screen.getByRole('button', {
      name: 'Confirm operation',
    });
    await fireEvent.click(confirm);
    expect(
      await screen.findByText(
        /The financial operation could not be completed/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Support request: request-first/i))
      .toBeInTheDocument();
    expect(screen.queryByText('Sensitive gateway failure detail'))
      .not.toBeInTheDocument();
    const firstKey =
      backendMocks.recordManualPayment.mock.calls[0][0].idempotencyKey;

    await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
      target: { value: '100.00' },
    });
    await fireEvent.click(confirm);
    await waitFor(() =>
      expect(backendMocks.recordManualPayment).toHaveBeenCalledTimes(2),
    );
    const changedKey =
      backendMocks.recordManualPayment.mock.calls[1][0].idempotencyKey;
    expect(changedKey).not.toBe(firstKey);

    await fireEvent.click(confirm);
    await waitFor(() =>
      expect(backendMocks.recordManualPayment).toHaveBeenCalledTimes(3),
    );
    expect(
      backendMocks.recordManualPayment.mock.calls[2][0].idempotencyKey,
    ).toBe(changedKey);
  });

  it('locks mutable fields in flight and ignores a result after the tenant changes', async () => {
    const record = invoice({ stripeInvoiceId: null });
    backendMocks.directInvoiceLedger.mockImplementation(
      async (requestedTenantId: string) => ({
        ...ledger(record),
        tenantId: requestedTenantId,
      }),
    );
    const pending = Promise.withResolvers<DirectInvoiceRecord>();
    backendMocks.recordManualPayment.mockReturnValue(pending.promise);
    const view = render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });
    await screen.findByRole('heading', { name: 'Ledger timeline' });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Record offline payment' }),
    );
    await fireEvent.input(screen.getByLabelText('Receipt or reference'), {
      target: { value: 'receipt-2' },
    });
    await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
      target: { value: 'Received at the front desk.' },
    });
    await fireEvent.click(
      screen.getByLabelText(/I reviewed the amount, scope/i),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Confirm operation' }),
    );

    expect(screen.getByLabelText('Amount (USD)')).toBeDisabled();
    expect(screen.getByLabelText('Receipt or reference')).toBeDisabled();
    await view.rerender({
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'other-tenant',
      ownerAuthorized: true,
    });
    pending.resolve(invoice({ status: 'paid', amountDueCents: 0 }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          'The operation was accepted by the authoritative backend.',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it('creates an integer-minor-unit draft and safely reuses the key for an unchanged retry', async () => {
    const created = invoice({ status: 'draft', issuedAt: null });
    backendMocks.createDirectInvoice
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Private upstream response',
          status: 502,
          requestId: 'draft-request',
        }),
      )
      .mockResolvedValueOnce(created);

    render(TestedTransactionDetails, {
      open: true,
      row: null,
      createMode: true,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });
    await fireEvent.input(screen.getByLabelText('Recipient name'), {
      target: { value: 'Parent One' },
    });
    await fireEvent.input(screen.getByLabelText('Recipient email'), {
      target: { value: 'PARENT@EXAMPLE.TEST' },
    });
    await fireEvent.input(screen.getByLabelText('Invoice title'), {
      target: { value: 'Summer program' },
    });
    await fireEvent.input(screen.getByLabelText('Description'), {
      target: { value: 'Registration fee' },
    });
    await fireEvent.input(screen.getByLabelText('Quantity'), {
      target: { value: '2' },
    });
    await fireEvent.input(screen.getByLabelText('Unit amount (USD)'), {
      target: { value: '10.25' },
    });
    await fireEvent.input(screen.getByLabelText('Discount (USD)'), {
      target: { value: '0.50' },
    });
    await fireEvent.input(screen.getByLabelText('Tax percent'), {
      target: { value: '10' },
    });
    await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
      target: { value: 'Create the approved summer invoice.' },
    });
    await fireEvent.click(
      screen.getByLabelText(/I reviewed the recipient, line items/i),
    );

    expect(screen.getByText('$20.50')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByText('$22.00')).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create draft' });
    await fireEvent.click(create);
    expect(
      await screen.findByText(/The invoice draft could not be created/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Private upstream response'))
      .not.toBeInTheDocument();
    const firstCall = backendMocks.createDirectInvoice.mock.calls[0];
    expect(firstCall[0]).toEqual(
      expect.objectContaining({
        tenantId: 'fixture-tenant',
        recipientEmail: 'parent@example.test',
        title: 'Summer program',
        discountCents: 50,
        taxRateBps: 1_000,
        lineItems: [
          {
            description: 'Registration fee',
            quantity: 2,
            unitAmountCents: 1_025,
          },
        ],
      }),
    );
    await fireEvent.click(create);
    await waitFor(() =>
      expect(backendMocks.createDirectInvoice).toHaveBeenCalledTimes(2),
    );
    expect(backendMocks.createDirectInvoice.mock.calls[1][1])
      .toBe(firstCall[1]);
  });

  it.each([
    [
      'Issue invoice',
      'issue',
      invoice({
        status: 'draft',
        issuedAt: null,
        hostedInvoiceUrl: null,
        stripeInvoiceId: null,
      }),
    ],
    ['Send reminder', 'remind', invoice()],
    ['Void invoice', 'void', invoice()],
  ] as const)(
    'submits the %s action with an audit reason and operation-bound key',
    async (buttonName, action, record) => {
      backendMocks.directInvoiceLedger.mockResolvedValue(ledger(record));
      backendMocks.directInvoiceAction.mockResolvedValue(record);
      render(TestedTransactionDetails, {
        open: true,
        row: invoiceRow(record),
        createMode: false,
        tenantId: 'fixture-tenant',
        ownerAuthorized: true,
      });
      await screen.findByRole('heading', { name: 'Ledger timeline' });
      await fireEvent.click(
        screen.getByRole('button', { name: buttonName }),
      );
      await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
        target: { value: `Approved ${action} operation.` },
      });
      await fireEvent.click(
        screen.getByLabelText(/I reviewed the amount, scope/i),
      );
      await fireEvent.click(
        screen.getByRole('button', { name: 'Confirm operation' }),
      );

      await waitFor(() => {
        expect(backendMocks.directInvoiceAction).toHaveBeenCalledTimes(1);
      });
      expect(backendMocks.directInvoiceAction).toHaveBeenCalledWith(
        'fixture-tenant',
        'invoice-1',
        action,
        expect.stringContaining(`${action}-invoice-1:`),
        `Approved ${action} operation.`,
      );
    },
  );

  it('submits only the authoritative refundable invoice balance and processor reason', async () => {
    const record = invoice({
      status: 'paid',
      amountPaidCents: 12_500,
      amountDueCents: 0,
    });
    backendMocks.directInvoiceLedger.mockResolvedValue(ledger(record));
    backendMocks.refundDirectInvoice.mockResolvedValue(
      invoice({
        status: 'partially_refunded',
        amountPaidCents: 12_500,
        amountRefundedCents: 2_500,
        amountDueCents: 0,
      }),
    );
    render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });
    await screen.findByRole('heading', { name: 'Ledger timeline' });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Refund invoice payment' }),
    );
    await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
      target: { value: '25.00' },
    });
    await fireEvent.change(screen.getByLabelText('Processor reason'), {
      target: { value: 'duplicate' },
    });
    await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
      target: { value: 'Approved duplicate charge refund.' },
    });
    await fireEvent.click(
      screen.getByLabelText(/I reviewed the amount, scope/i),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Confirm operation' }),
    );

    await waitFor(() =>
      expect(backendMocks.refundDirectInvoice).toHaveBeenCalledTimes(1),
    );
    expect(backendMocks.refundDirectInvoice).toHaveBeenCalledWith({
      tenantId: 'fixture-tenant',
      invoiceId: 'invoice-1',
      amountCents: 2_500,
      reason: 'duplicate',
      note: 'Approved duplicate charge refund.',
      idempotencyKey: expect.stringContaining(
        'invoice_refund-invoice-1:',
      ),
    });
  });

  it('submits a core transaction refund without treating a dispute as resolved', async () => {
    backendMocks.refundTransaction.mockResolvedValue({
      success: true,
      idempotentReplay: false,
      transactionId: 'transaction-1',
      refund: { id: 'refund-1' },
      requestId: 'refund-request',
    });
    render(TestedTransactionDetails, {
      open: true,
      row: transactionRow({ status: 'disputed' }),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Refund transaction' }),
    );
    expect(
      screen.getByText(/Refunding does not close or concede/i),
    ).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
      target: { value: '20.00' },
    });
    await fireEvent.input(screen.getByLabelText('Internal audit reason'), {
      target: { value: 'Approved family refund.' },
    });
    await fireEvent.click(
      screen.getByLabelText(/I reviewed the amount, scope/i),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Confirm operation' }),
    );

    await waitFor(() =>
      expect(backendMocks.refundTransaction).toHaveBeenCalledTimes(1),
    );
    expect(backendMocks.refundTransaction).toHaveBeenCalledWith({
      tenantId: 'fixture-tenant',
      transactionId: 'transaction-1',
      amountCents: 2_000,
      reason: 'requested_by_customer',
      note: 'Approved family refund.',
      idempotencyKey: expect.stringContaining(
        'core_refund-transaction-1:',
      ),
    });
  });

  it('does not render untrusted hosted invoice or PDF links', async () => {
    const record = invoice({
      hostedInvoiceUrl: 'javascript:alert(1)',
      invoicePdfUrl: 'https://user:secret@example.test/invoice.pdf',
    });
    backendMocks.directInvoiceLedger.mockResolvedValue(ledger(record));
    render(TestedTransactionDetails, {
      open: true,
      row: invoiceRow(record),
      createMode: false,
      tenantId: 'fixture-tenant',
      ownerAuthorized: true,
    });

    expect(screen.queryByRole('link', { name: 'Open hosted invoice' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open invoice PDF' }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/Hosted invoice link unavailable/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Invoice PDF unavailable/i))
      .toBeInTheDocument();
  });
});
