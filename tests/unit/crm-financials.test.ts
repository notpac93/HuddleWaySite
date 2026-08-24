import { describe, expect, it } from 'vitest';
import type { DirectInvoiceRecord } from '../../src/lib/api/BackendApi';
import {
  directInvoiceActions,
  formatMinorUnits,
  parseMajorUnitInput,
  parsePercentToBasisPoints,
  reconcileDeposit,
  refundableCoreTransactionCents,
  summarizeFinancialsByCurrency,
} from '../../src/lib/finance/crmFinancials';

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
    accountingReconciliationRequired: false,
    accountingReconciledAt: null,
    ...overrides,
  };
}

describe('CRM financial view-model contracts', () => {
  it('parses major-unit input without floating-point persistence', () => {
    expect(parseMajorUnitInput('0.50')).toBe(50);
    expect(parseMajorUnitInput('12')).toBe(1_200);
    expect(parseMajorUnitInput('1,234.5')).toBe(123_450);
    expect(parseMajorUnitInput('12.345')).toBeNull();
    expect(parseMajorUnitInput('-1.00')).toBeNull();
    expect(parseMajorUnitInput('1e3')).toBeNull();
    expect(parsePercentToBasisPoints('8.25')).toBe(825);
    expect(parsePercentToBasisPoints('100.01')).toBeNull();
  });

  it('keeps totals separate by currency and excludes malformed projections', () => {
    const result = summarizeFinancialsByCurrency({
      transactions: [
        {
          id: 'tx-usd',
          status: 'succeeded',
          grossAmount: 10_000,
          feeAmount: 300,
          netAmount: 9_700,
          currency: 'USD',
        },
        {
          id: 'tx-cad',
          status: 'succeeded',
          grossAmount: 5_000,
          feeAmount: 100,
          netAmount: 4_900,
          currency: 'CAD',
        },
        {
          id: 'tx-invalid',
          status: 'succeeded',
          grossAmount: 12.5,
          feeAmount: 1,
          netAmount: 11.5,
          currency: 'USD',
        },
      ],
      refunds: [
        {
          id: 'refund-usd',
          status: 'succeeded',
          amountCents: 2_000,
          currency: 'USD',
        },
      ],
      directInvoices: [
        invoice({ id: 'invoice-usd', amountDueCents: 2_500 }),
      ],
    });

    expect(result.excludedRecordCount).toBe(1);
    expect(result.summaries).toEqual([
      {
        currency: 'CAD',
        collectedCents: 5_000,
        feeCents: 100,
        netCents: 4_900,
        refundedCents: 0,
        outstandingCents: 0,
      },
      {
        currency: 'USD',
        collectedCents: 10_000,
        feeCents: 300,
        netCents: 9_700,
        refundedCents: 2_000,
        outstandingCents: 2_500,
      },
    ]);
    expect(formatMinorUnits(10_000, 'USD')).toBe('$100.00');
    expect(formatMinorUnits(10.5, 'USD')).toBe('Unavailable');
  });

  it('derives direct-invoice controls only from canonical lifecycle state', () => {
    const open = directInvoiceActions(invoice());
    expect(open.issue.enabled).toBe(false);
    expect(open.remind.enabled).toBe(true);
    expect(open.manualPayment.enabled).toBe(true);
    expect(open.refund.enabled).toBe(false);
    expect(open.void.enabled).toBe(true);

    const paid = directInvoiceActions(
      invoice({
        status: 'paid',
        amountPaidCents: 12_500,
        amountDueCents: 0,
        amountRefundedCents: 2_500,
      }),
    );
    expect(paid.refund.enabled).toBe(true);
    expect(paid.refundableCents).toBe(10_000);
    expect(paid.manualPayment.enabled).toBe(false);
    expect(paid.void.enabled).toBe(false);
  });

  it('reconciles payout totals and detects missing or divergent membership', () => {
    const transactions = [
      {
        id: 'tx-1',
        currency: 'USD',
        grossAmount: 10_000,
        feeAmount: 300,
        netAmount: 9_700,
      },
      {
        id: 'tx-2',
        currency: 'USD',
        grossAmount: 5_000,
        feeAmount: 150,
        netAmount: 4_850,
      },
    ];
    const balanced = reconcileDeposit(
      {
        id: 'deposit-1',
        currency: 'USD',
        totalGross: 15_000,
        totalFees: 450,
        totalNet: 14_550,
        transactionIds: ['tx-1', 'tx-2'],
      },
      transactions,
    );
    expect(balanced.status).toBe('balanced');
    expect(balanced.netDifferenceCents).toBe(0);

    const variance = reconcileDeposit(
      {
        id: 'deposit-2',
        currency: 'USD',
        totalGross: 15_000,
        totalFees: 400,
        totalNet: 14_600,
        transactionIds: ['tx-1', 'tx-2'],
      },
      transactions,
    );
    expect(variance.status).toBe('variance');
    expect(variance.feeDifferenceCents).toBe(-50);

    const incomplete = reconcileDeposit(
      {
        id: 'deposit-3',
        currency: 'USD',
        totalGross: 15_000,
        totalFees: 450,
        totalNet: 14_550,
        transactionIds: ['tx-1', 'missing'],
      },
      transactions,
    );
    expect(incomplete.status).toBe('incomplete');
    expect(incomplete.missingTransactionIds).toEqual(['missing']);
  });

  it('calculates core refundable balance without erasing the original payment', () => {
    expect(
      refundableCoreTransactionCents({
        status: 'succeeded',
        grossAmount: 10_000,
        amountRefunded: 2_500,
      }),
    ).toBe(7_500);
    expect(
      refundableCoreTransactionCents({
        status: 'disputed',
        grossAmount: 10_000,
        amountRefunded: 12_000,
      }),
    ).toBe(0);
    expect(
      refundableCoreTransactionCents({
        status: 'succeeded',
        grossAmount: 10.5,
        amountRefunded: 0,
      }),
    ).toBeNull();
    expect(
      refundableCoreTransactionCents({
        status: 'failed',
        grossAmount: 10_000,
        amountRefunded: 0,
      }),
    ).toBeNull();
    expect(
      refundableCoreTransactionCents({
        status: 'pending',
        grossAmount: 10_000,
        amountRefunded: 0,
      }),
    ).toBeNull();
  });
});
