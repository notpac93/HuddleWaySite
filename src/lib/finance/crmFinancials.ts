import type { DirectInvoiceRecord } from '../api/BackendApi';

export type FinanceRecord = Record<string, unknown>;

export type FinanceRecordKind =
  | 'direct_invoice'
  | 'core_invoice'
  | 'transaction'
  | 'refund'
  | 'dispute'
  | 'deposit';

export interface FinanceTableRow {
  id: string;
  recordId?: string;
  kind: FinanceRecordKind;
  dateIso: string | null;
  dateLabel: string;
  recordLabel: string;
  partyLabel: string;
  contextLabel: string;
  status: string;
  currency: string | null;
  primaryCents: number | null;
  secondaryCents: number | null;
  primaryLabel: string;
  secondaryLabel: string;
  original: FinanceRecord | DirectInvoiceRecord;
}

export interface CurrencySummary {
  currency: string;
  collectedCents: number;
  feeCents: number;
  netCents: number;
  refundedCents: number;
  outstandingCents: number;
}

export interface DepositReconciliation {
  status: 'balanced' | 'variance' | 'incomplete' | 'invalid';
  currency: string | null;
  transactionCount: number;
  missingTransactionIds: string[];
  grossCents: number | null;
  feeCents: number | null;
  netCents: number | null;
  grossDifferenceCents: number | null;
  feeDifferenceCents: number | null;
  netDifferenceCents: number | null;
  message: string;
}

export interface DirectInvoiceActions {
  issue: { enabled: boolean; reason: string };
  remind: { enabled: boolean; reason: string };
  manualPayment: { enabled: boolean; reason: string };
  refund: { enabled: boolean; reason: string };
  void: { enabled: boolean; reason: string };
  refundableCents: number;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export function persistedDirectInvoice(
  value: unknown,
  invoices: DirectInvoiceRecord[],
): DirectInvoiceRecord | null {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return null;
  return id ? invoices.find((invoice) => invoice.id === id) ?? null : null;
}

export function safeMinorUnits(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function safeCurrency(value: unknown): string | null {
  const currency = String(value || '').trim().toUpperCase();
  return CURRENCY_PATTERN.test(currency) ? currency : null;
}

export function formatMinorUnits(
  value: unknown,
  currency: unknown,
  locale = 'en-US',
): string {
  const cents = safeMinorUnits(value);
  const code = safeCurrency(currency);
  if (cents === null || !code) return 'Unavailable';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    }).format(cents / 100);
  } catch {
    return 'Unavailable';
  }
}

/**
 * Parses a human-entered major-unit amount without floating-point arithmetic.
 * The return value is suitable for the backend's integer minor-unit contracts.
 */
export function parseMajorUnitInput(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '');
  const match = normalized.match(/^(?:0|[1-9]\d{0,12})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parsePercentToBasisPoints(value: string): number | null {
  const normalized = value.trim();
  const match = normalized.match(/^(?:0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(basisPoints) && basisPoints <= 10_000
    ? basisPoints
    : null;
}

export function humanizeStatus(value: unknown): string {
  const status = String(value || '').trim();
  if (!status) return 'Unavailable';
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function dateLabel(value: unknown, locale = 'en-US'): string {
  if (!value) return 'Unavailable';
  const maybeDate =
    typeof (value as { toDate?: unknown })?.toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : new Date(String(value));
  return Number.isNaN(maybeDate.getTime())
    ? 'Unavailable'
    : maybeDate.toLocaleDateString(locale);
}

function emptyCurrencySummary(currency: string): CurrencySummary {
  return {
    currency,
    collectedCents: 0,
    feeCents: 0,
    netCents: 0,
    refundedCents: 0,
    outstandingCents: 0,
  };
}

export function summarizeFinancialsByCurrency({
  transactions,
  refunds,
  directInvoices,
}: {
  transactions: FinanceRecord[];
  refunds: FinanceRecord[];
  directInvoices: DirectInvoiceRecord[];
}): {
  summaries: CurrencySummary[];
  excludedRecordCount: number;
} {
  const totals = new Map<string, CurrencySummary>();
  let excludedRecordCount = 0;
  const summaryFor = (currency: string) => {
    const current = totals.get(currency) ?? emptyCurrencySummary(currency);
    totals.set(currency, current);
    return current;
  };

  for (const transaction of transactions) {
    if (String(transaction.status || '').toLowerCase() !== 'succeeded') continue;
    const currency = safeCurrency(transaction.currency);
    const gross = safeMinorUnits(transaction.grossAmount);
    const fee = safeMinorUnits(transaction.feeAmount);
    const net = safeMinorUnits(transaction.netAmount);
    if (!currency || gross === null || fee === null || net === null) {
      excludedRecordCount += 1;
      continue;
    }
    const summary = summaryFor(currency);
    summary.collectedCents += gross;
    summary.feeCents += fee;
    summary.netCents += net;
  }

  for (const refund of refunds) {
    if (String(refund.status || '').toLowerCase() !== 'succeeded') continue;
    const currency = safeCurrency(refund.currency);
    const amount = safeMinorUnits(refund.amountCents);
    if (!currency || amount === null) {
      excludedRecordCount += 1;
      continue;
    }
    summaryFor(currency).refundedCents += amount;
  }

  for (const invoice of directInvoices) {
    if (
      !['open', 'partially_paid', 'past_due'].includes(
        String(invoice.status || '').toLowerCase(),
      )
    ) {
      continue;
    }
    const currency = safeCurrency(invoice.currency);
    const due = safeMinorUnits(invoice.amountDueCents);
    if (!currency || due === null) {
      excludedRecordCount += 1;
      continue;
    }
    summaryFor(currency).outstandingCents += due;
  }

  return {
    summaries: [...totals.values()].sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
    excludedRecordCount,
  };
}

export function refundableCoreTransactionCents(
  transaction: FinanceRecord,
): number | null {
  const status = String(transaction.status || '').toLocaleLowerCase();
  if (!['succeeded', 'disputed'].includes(status)) return null;
  const gross = safeMinorUnits(transaction.grossAmount);
  const refunded = safeMinorUnits(transaction.amountRefunded ?? 0);
  if (gross === null || refunded === null || gross < 0 || refunded < 0) {
    return null;
  }
  return Math.max(0, gross - refunded);
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function directInvoiceActions(
  invoice: DirectInvoiceRecord,
): DirectInvoiceActions {
  const status = String(invoice.status || '').toLowerCase();
  const due = safeMinorUnits(invoice.amountDueCents);
  const paid = safeMinorUnits(invoice.amountPaidCents);
  const refunded = safeMinorUnits(invoice.amountRefundedCents);
  const refundableCents =
    paid !== null && refunded !== null ? Math.max(0, paid - refunded) : 0;
  const requiresReconciliation = invoice.accountingReconciliationRequired === true;
  const issueEnabled = ['draft', 'issuing'].includes(status);
  const remindEnabled =
    ['open', 'past_due'].includes(status)
    && Boolean(safeHttpsUrl(invoice.hostedInvoiceUrl));
  const manualEnabled =
    ['open', 'partially_paid', 'past_due'].includes(status)
    && due !== null
    && due > 0;
  const refundEnabled =
    ['paid', 'partially_refunded'].includes(status)
    && refundableCents > 0
    && Boolean(invoice.stripeInvoiceId)
    && !requiresReconciliation;
  const voidEnabled = [
    'draft',
    'issuing',
    'open',
    'partially_paid',
    'past_due',
  ].includes(status);

  return {
    issue: {
      enabled: issueEnabled,
      reason: issueEnabled ? '' : 'Only draft or interrupted issuing invoices can be issued.',
    },
    remind: {
      enabled: remindEnabled,
      reason: remindEnabled
        ? ''
        : 'Reminders require an open or past-due invoice with a hosted payment link.',
    },
    manualPayment: {
      enabled: manualEnabled,
      reason: manualEnabled
        ? ''
        : 'Manual payments require an open invoice with a positive authoritative balance.',
    },
    refund: {
      enabled: refundEnabled,
      reason: refundEnabled
        ? ''
        : requiresReconciliation
          ? 'Refresh Stripe totals before refunding this legacy invoice.'
          : 'Processor refunds require a reconciled paid invoice with a refundable balance.',
    },
    void: {
      enabled: voidEnabled,
      reason: voidEnabled
        ? ''
        : 'This invoice status cannot transition to void.',
    },
    refundableCents,
  };
}

export function reconcileDeposit(
  deposit: FinanceRecord,
  transactions: FinanceRecord[],
): DepositReconciliation {
  const currency = safeCurrency(deposit.currency);
  const totalGross = safeMinorUnits(deposit.totalGross);
  const totalFees = safeMinorUnits(deposit.totalFees);
  const totalNet = safeMinorUnits(deposit.totalNet);
  const transactionIds = Array.isArray(deposit.transactionIds)
    ? deposit.transactionIds.map(String).filter(Boolean)
    : [];

  if (!currency || totalGross === null || totalFees === null || totalNet === null) {
    return {
      status: 'invalid',
      currency,
      transactionCount: transactionIds.length,
      missingTransactionIds: [],
      grossCents: null,
      feeCents: null,
      netCents: null,
      grossDifferenceCents: null,
      feeDifferenceCents: null,
      netDifferenceCents: null,
      message: 'The payout projection contains invalid currency or minor-unit totals.',
    };
  }

  const byId = new Map(
    transactions
      .filter((transaction) => transaction.id)
      .map((transaction) => [String(transaction.id), transaction]),
  );
  const missingTransactionIds = transactionIds.filter((id) => !byId.has(id));
  let grossCents = 0;
  let feeCents = 0;
  let netCents = 0;
  let hasInvalidTransaction = false;

  for (const id of transactionIds) {
    const transaction = byId.get(id);
    if (!transaction) continue;
    const transactionCurrency = safeCurrency(transaction.currency);
    const gross = safeMinorUnits(transaction.grossAmount);
    const fee = safeMinorUnits(transaction.feeAmount);
    const net = safeMinorUnits(transaction.netAmount);
    if (
      transactionCurrency !== currency
      || gross === null
      || fee === null
      || net === null
    ) {
      hasInvalidTransaction = true;
      continue;
    }
    grossCents += gross;
    feeCents += fee;
    netCents += net;
  }

  const grossDifferenceCents = totalGross - grossCents;
  const feeDifferenceCents = totalFees - feeCents;
  const netDifferenceCents = totalNet - netCents;
  const incomplete =
    missingTransactionIds.length > 0 || hasInvalidTransaction;
  const balanced =
    !incomplete
    && grossDifferenceCents === 0
    && feeDifferenceCents === 0
    && netDifferenceCents === 0;

  return {
    status: incomplete ? 'incomplete' : balanced ? 'balanced' : 'variance',
    currency,
    transactionCount: transactionIds.length,
    missingTransactionIds,
    grossCents,
    feeCents,
    netCents,
    grossDifferenceCents,
    feeDifferenceCents,
    netDifferenceCents,
    message: incomplete
      ? 'Reconciliation is incomplete because one or more transaction projections are missing or invalid.'
      : balanced
        ? 'The payout totals match every referenced transaction projection.'
        : 'The payout projection differs from its referenced transaction totals.',
  };
}
