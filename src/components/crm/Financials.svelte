<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    activeTenantRole,
    tenantIdStore,
  } from '../../lib/authStore';
  import {
    BackendApiError,
    createIdempotencyKey,
    type DirectInvoiceRecord,
    type FinancialOverview,
  } from '../../lib/api/BackendApi';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    dateLabel,
    formatMinorUnits,
    humanizeStatus,
    persistedDirectInvoice,
    reconcileDeposit,
    safeCurrency,
    safeMinorUnits,
    type FinanceRecord,
    type FinanceTableRow,
  } from '../../lib/finance/crmFinancials';
  import FinancialPeriodManager from './FinancialPeriodManager.svelte';
  import TransactionDetails from './TransactionDetails.svelte';

  export let activeTeam: { id?: string; name?: string } | string | null = null;

  type FinanceView =
    | 'Overview'
    | 'Invoices'
    | 'Outstanding'
    | 'Transactions'
    | 'Refunds'
    | 'Disputes'
    | 'Deposits'
    | 'Reconciliation';
  type LoadState = 'idle' | 'loading' | 'ready' | 'permission' | 'error';
  type SortKey = 'dateIso' | 'recordLabel' | 'status' | 'primaryCents';
  type SavedView = {
    name: string;
    activeView: FinanceView;
    search: string;
    status: string;
    currency: string;
    fromDate: string;
    toDate: string;
    sortKey: SortKey;
    sortDirection: 'asc' | 'desc';
    pageSize: number;
    visibleColumns: string[];
  };

  const views: FinanceView[] = [
    'Overview',
    'Invoices',
    'Outstanding',
    'Transactions',
    'Refunds',
    'Disputes',
    'Deposits',
    'Reconciliation',
  ];
  const primaryViews: FinanceView[] = [
    'Deposits',
    'Outstanding',
    'Transactions',
  ];
  const toolViews: Array<{ view: FinanceView; label: string }> = [
    { view: 'Invoices', label: 'Invoices' },
    { view: 'Refunds', label: 'Refunds' },
    { view: 'Disputes', label: 'Disputes' },
    { view: 'Reconciliation', label: 'Reconcile' },
    { view: 'Overview', label: 'Periods' },
  ];
  const allColumns = [
    { id: 'date', label: 'Date' },
    { id: 'record', label: 'Record' },
    { id: 'party', label: 'Party / source' },
    { id: 'context', label: 'Context' },
    { id: 'status', label: 'Status' },
    { id: 'primary', label: 'Amount' },
    { id: 'secondary', label: 'Balance / net' },
  ];

  let loadState: LoadState = 'idle';
  let overview: FinancialOverview | null = null;
  let directInvoices: DirectInvoiceRecord[] = [];
  let directInvoicesIncomplete = false;
  let loadError = '';
  let loadRequestId = '';
  let lastLoadedAt: Date | null = null;
  let loadedTenantId = '';
  let loadIdentity = '';
  let loadSequence = 0;
  let activeTeamScope = '';

  let activeView: FinanceView = 'Deposits';
  let filtersOpen = false;
  let searchInput = '';
  let searchQuery = '';
  let statusFilter = '';
  let currencyFilter = '';
  let fromDate = '';
  let toDate = '';
  let sortKey: SortKey = 'dateIso';
  let sortDirection: 'asc' | 'desc' = 'desc';
  let pageSize = 25;
  let page = 1;
  let selectedIds = new Set<string>();
  let visibleColumns = new Set(allColumns.map((column) => column.id));
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let detailsOpen = false;
  let createMode = false;
  let selectedRow: FinanceTableRow | null = null;
  let exportState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let exportMessage = '';
  let exportRequestId = '';
  let exportKeySignature = '';
  let exportOperationKey = '';
  let exportGeneration = 0;
  let observedExportSignature = '';

  let savedViews: SavedView[] = [];
  let savedViewName = '';
  let selectedSavedView = '';
  let savedViewMessage = '';
  let hydratedFromUrl = false;

  $: teamId =
    typeof activeTeam === 'string'
      ? activeTeam
      : String(activeTeam?.id || '').trim();
  $: teamLabel =
    typeof activeTeam === 'object' && activeTeam?.name
      ? activeTeam.name
      : teamId || 'Organization';
  $: ownerAuthorized =
    $activeTenantRole === 'owner' || $activeTenantRole === 'platform_admin';

  $: nextLoadIdentity = `${$tenantIdStore || ''}:${ownerAuthorized}`;
  $: if (nextLoadIdentity !== loadIdentity) {
    loadIdentity = nextLoadIdentity;
    loadSequence += 1;
    exportGeneration += 1;
    loadedTenantId = $tenantIdStore || '';
    overview = null;
    directInvoices = [];
    directInvoicesIncomplete = false;
    detailsOpen = false;
    selectedRow = null;
    createMode = false;
    selectedIds = new Set();
    resetExportState();
    if (loadedTenantId && ownerAuthorized) {
      loadSavedViews();
      void loadFinancials();
    } else {
      loadState = loadedTenantId ? 'permission' : 'idle';
    }
  }
  $: if (teamId !== activeTeamScope) {
    activeTeamScope = teamId;
    exportGeneration += 1;
    selectedIds = new Set();
    page = 1;
    detailsOpen = false;
    selectedRow = null;
    syncUrl();
    createMode = false;
    resetExportState();
  }

  $: scopedTransactions = scopedCoreRecords(
    overview?.transactions ?? [],
    teamId,
  );
  $: scopedRefunds = teamId ? [] : overview?.refunds ?? [];
  $: scopedCoreInvoices = scopedCoreRecords(
    overview?.invoices ?? [],
    teamId,
  );
  $: scopedDeposits = teamId ? [] : overview?.deposits ?? [];
  $: scopedDirectInvoices = teamId ? [] : directInvoices;
  $: baseRows = buildRows(
    activeView,
    scopedDirectInvoices,
    scopedCoreInvoices,
    scopedTransactions,
    scopedRefunds,
    scopedDeposits,
  );
  $: leadSummary = buildLeadSummary(
    activeView,
    baseRows,
    scopedRefunds,
  );
  $: tableLabels = financialColumnLabels(activeView);
  $: statusOptions = [
    ...new Set(baseRows.map((row) => row.status).filter(Boolean)),
  ].sort();
  $: currencyOptions = [
    ...new Set(baseRows.map((row) => row.currency).filter(Boolean)),
  ].sort() as string[];
  $: filteredRows = filterAndSortRows(
    baseRows,
    searchQuery,
    statusFilter,
    currencyFilter,
    fromDate,
    toDate,
    sortKey,
    sortDirection,
  );
  $: pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  $: if (page > pageCount) page = pageCount;
  $: pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  $: currentPageIds = pagedRows.map((row) => row.id);
  $: currentPageSelected =
    currentPageIds.length > 0
    && currentPageIds.every((id) => selectedIds.has(id));
  $: truncationWarnings = financialTruncationWarnings(
    overview,
    directInvoicesIncomplete,
    directInvoices.length,
  );
  $: currentExportSignature = invoiceExportSignature(
    $tenantIdStore,
    selectedInvoiceIds(filteredRows, selectedIds),
  );
  $: if (currentExportSignature !== observedExportSignature) {
    observedExportSignature = currentExportSignature;
    exportGeneration += 1;
    exportState = 'idle';
    exportMessage = '';
    exportRequestId = '';
  }

  onMount(() => {
    hydrateUrl();
    hydratedFromUrl = true;
    if (!ownerAuthorized || detailsOpen) syncUrl();
  });

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    loadSequence += 1;
    exportGeneration += 1;
  });

  function scopedCoreRecords(records: FinanceRecord[], scopeTeamId: string) {
    return scopeTeamId
      ? records.filter(
          (record) => String(record.teamId || '') === scopeTeamId,
        )
      : records;
  }

  function supportError(error: unknown) {
    if (error instanceof BackendApiError) {
      loadRequestId = error.requestId || '';
    } else {
      loadRequestId = '';
    }
    return 'Financial records could not be loaded. Retry or contact support.';
  }

  function resetExportState() {
    exportState = 'idle';
    exportMessage = '';
    exportRequestId = '';
    exportKeySignature = '';
    exportOperationKey = '';
  }

  function invoiceExportSignature(
    tenantId: string | null,
    invoiceIds: string[],
  ) {
    return JSON.stringify({
      tenantId: tenantId || '',
      ids: [...new Set(invoiceIds)].sort(),
    });
  }

  async function loadFinancials() {
    const tenantId = $tenantIdStore;
    if (!tenantId || !ownerAuthorized) {
      loadSequence += 1;
      loadState = ownerAuthorized ? 'idle' : 'permission';
      overview = null;
      directInvoices = [];
      directInvoicesIncomplete = false;
      return;
    }
    const sequence = ++loadSequence;
    loadState = 'loading';
    loadError = '';
    loadRequestId = '';
    try {
      const [nextOverview, directInvoiceProjection] = await Promise.all([
        backendClient.financialOverview(tenantId),
        loadDirectInvoiceProjection(tenantId),
      ]);
      if (sequence !== loadSequence || $tenantIdStore !== tenantId) return;
      if (nextOverview.tenantId !== tenantId) {
        throw new Error(
          'The financial response did not match the active organization.',
        );
      }
      overview = nextOverview;
      directInvoices = directInvoiceProjection.invoices;
      directInvoicesIncomplete = directInvoiceProjection.incomplete;
      lastLoadedAt = new Date();
      loadState = 'ready';
      restoreInvoiceDetail();
    } catch (error) {
      if (
        sequence !== loadSequence
        || $tenantIdStore !== tenantId
        || !ownerAuthorized
      ) return;
      overview = null;
      directInvoices = [];
      directInvoicesIncomplete = false;
      if (error instanceof BackendApiError && error.status === 403) {
        loadState = 'permission';
      } else {
        loadState = 'error';
      }
      loadError = supportError(error);
    }
  }

  async function loadDirectInvoiceProjection(tenantId: string) {
    const invoices: DirectInvoiceRecord[] = [];
    const seenInvoiceIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const page = await backendClient.directInvoicePage(tenantId, {
        limit: 200,
        cursor,
      });
      if (page.tenantId !== tenantId || !Array.isArray(page.invoices)) {
        throw new Error(
          'The direct-invoice response did not match the active organization.',
        );
      }
      for (const invoice of page.invoices) {
        if (!invoice?.id || seenInvoiceIds.has(invoice.id)) continue;
        seenInvoiceIds.add(invoice.id);
        invoices.push(invoice);
      }
      if (!page.hasMore) {
        return { invoices, incomplete: false };
      }
      const nextCursor = String(page.nextCursor || '').trim();
      if (!nextCursor || seenCursors.has(nextCursor)) {
        return { invoices, incomplete: true };
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

  }

  function rowCurrency(record: FinanceRecord) {
    return safeCurrency(record.currency);
  }

  function coreParty(record: FinanceRecord) {
    return (
      String(record.memberName || '').trim()
      || String(record.sourceLabel || '').trim()
      || String(record.userId || '').trim()
      || String(record.invoiceId || '').trim()
      || 'Party unavailable'
    );
  }

  function coreContext(record: FinanceRecord) {
    if (record.sourceLabel) return String(record.sourceLabel);
    if (record.teamId) return `Team ${String(record.teamId)}`;
    if (record.seasonId) return `Season ${String(record.seasonId)}`;
    if (record.eventId) return `Event ${String(record.eventId)}`;
    return 'Organization';
  }

  function recordIso(record: FinanceRecord, ...fields: string[]) {
    for (const field of fields) {
      const value = record[field];
      if (value) {
        const parsed = new Date(String(value));
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
    }
    return null;
  }

  function directInvoiceRow(
    invoice: DirectInvoiceRecord,
    dueDateOnly = false,
  ): FinanceTableRow {
    const date = dueDateOnly ? invoice.dueAt : invoice.dueAt || invoice.createdAt;
    return {
      id: `direct_invoice:${invoice.id}`,
      recordId: invoice.id,
      kind: 'direct_invoice',
      dateIso: date,
      dateLabel: dateLabel(date),
      recordLabel: invoice.invoiceNumber || invoice.id,
      partyLabel:
        invoice.recipientName
        || invoice.recipientEmail
        || 'Recipient unavailable',
      contextLabel: invoice.title || 'Direct invoice',
      status: invoice.status,
      currency: safeCurrency(invoice.currency),
      primaryCents: safeMinorUnits(invoice.totalCents),
      secondaryCents: safeMinorUnits(invoice.amountDueCents),
      primaryLabel: 'Invoice total',
      secondaryLabel: 'Amount due',
      original: invoice as unknown as FinanceRecord,
    };
  }

  function coreInvoiceRow(
    invoice: FinanceRecord,
    dueDateOnly = false,
  ): FinanceTableRow {
    const currency = rowCurrency(invoice);
    const recordId = String(invoice.id || '');
    const date = dueDateOnly
      ? invoice.dueAt || invoice.dueDate
      : invoice.dueAt || invoice.dueDate || invoice.createdAt || invoice.updatedAt;
    return {
      id: `core_invoice:${recordId}`,
      recordId,
      kind: 'core_invoice',
      dateIso: dueDateOnly
        ? recordIso(invoice, 'dueAt', 'dueDate')
        : recordIso(invoice, 'dueAt', 'dueDate', 'createdAt', 'updatedAt'),
      dateLabel: dateLabel(date),
      recordLabel: String(invoice.programName || invoice.id || 'Invoice'),
      partyLabel: String(invoice.sourceLabel || invoice.id || 'Invoice'),
      contextLabel: `${humanizeStatus(invoice.sourceType || 'invoice')} · ${coreParty(invoice)}`,
      status: String(invoice.status || 'unavailable'),
      currency,
      primaryCents: safeMinorUnits(invoice.amountDue),
      secondaryCents:
        safeMinorUnits(invoice.amountDue) === null
          ? null
          : Math.max(
              0,
              (safeMinorUnits(invoice.amountDue) ?? 0)
                - (safeMinorUnits(invoice.amountPaid) ?? 0),
            ),
      primaryLabel: 'Invoice total',
      secondaryLabel: 'Amount due',
      original: invoice,
    };
  }

  function transactionRow(
    transaction: FinanceRecord,
    kind: 'transaction' | 'dispute' = 'transaction',
  ): FinanceTableRow {
    const currency = rowCurrency(transaction);
    const recordId = String(transaction.id || '');
    return {
      id: `${kind}:${recordId}`,
      recordId,
      kind,
      dateIso: recordIso(transaction, 'createdAt', 'updatedAt'),
      dateLabel: dateLabel(transaction.createdAt || transaction.updatedAt),
      recordLabel: String(
        transaction.programName || transaction.id || 'Transaction',
      ),
      partyLabel: String(
        transaction.sourceLabel || transaction.sourceId || 'Payment',
      ),
      contextLabel:
        kind === 'dispute'
          ? `Processor dispute · ${coreContext(transaction)}`
          : `${humanizeStatus(transaction.sourceType || 'payment')} · ${humanizeStatus(transaction.paymentMethodType)} · ${coreParty(transaction)}`,
      status:
        kind === 'dispute'
          ? String(transaction.disputeStatus || transaction.status || 'unavailable')
          : String(transaction.status || 'unavailable'),
      currency,
      primaryCents: safeMinorUnits(transaction.grossAmount),
      secondaryCents: safeMinorUnits(transaction.netAmount),
      primaryLabel: 'Gross',
      secondaryLabel: 'Net',
      original: transaction,
    };
  }

  function refundRow(refund: FinanceRecord): FinanceTableRow {
    const recordId = String(refund.id || '');
    return {
      id: `refund:${recordId}`,
      recordId,
      kind: 'refund',
      dateIso: recordIso(refund, 'createdAt', 'updatedAt'),
      dateLabel: dateLabel(refund.createdAt || refund.updatedAt),
      recordLabel: String(refund.id || 'Refund'),
      partyLabel: String(
        refund.transactionId || refund.invoiceId || 'Source unavailable',
      ),
      contextLabel: humanizeStatus(refund.reason || 'processor refund'),
      status: String(refund.status || 'unavailable'),
      currency: rowCurrency(refund),
      primaryCents: safeMinorUnits(refund.amountCents),
      secondaryCents: null,
      primaryLabel: 'Refund amount',
      secondaryLabel: 'Balance',
      original: refund,
    };
  }

  function depositRow(
    deposit: FinanceRecord,
    transactions: FinanceRecord[],
    reconciliation = false,
  ): FinanceTableRow {
    const result = reconcileDeposit(deposit, transactions);
    const recordId = String(deposit.id || '');
    return {
      id: `${reconciliation ? 'reconciliation' : 'deposit'}:${recordId}`,
      recordId,
      kind: 'deposit',
      dateIso: recordIso(deposit, 'depositDate'),
      dateLabel: dateLabel(deposit.depositDate),
      recordLabel: String(
        deposit.depositAccount || deposit.id || 'Payout',
      ),
      partyLabel: humanizeStatus(
        deposit.paymentType || deposit.gateway || 'bank transfer',
      ),
      contextLabel: reconciliation
        ? result.message
        : `${Array.isArray(deposit.transactionIds) ? deposit.transactionIds.length : 0} transactions`,
      status: reconciliation
        ? result.status
        : String(deposit.status || 'unavailable'),
      currency: rowCurrency(deposit),
      primaryCents: safeMinorUnits(deposit.totalGross),
      secondaryCents: reconciliation
        ? result.netDifferenceCents
        : safeMinorUnits(deposit.totalNet),
      primaryLabel: 'Payout gross',
      secondaryLabel: reconciliation ? 'Net variance' : 'Bank net',
      original: deposit,
    };
  }

  function buildRows(
    view: FinanceView,
    directInvoiceRecords: DirectInvoiceRecord[],
    coreInvoiceRecords: FinanceRecord[],
    transactionRecords: FinanceRecord[],
    refundRecords: FinanceRecord[],
    depositRecords: FinanceRecord[],
  ): FinanceTableRow[] {
    if (view === 'Invoices') {
      return directInvoiceRecords.map((invoice) => directInvoiceRow(invoice));
    }
    if (view === 'Outstanding') {
      return [
        ...directInvoiceRecords
          .filter((invoice) =>
            ['open', 'partially_paid', 'past_due'].includes(invoice.status),
          )
          .map((invoice) => directInvoiceRow(invoice, true)),
        ...coreInvoiceRecords
          .filter((invoice) =>
            ['open', 'partially_paid', 'past_due'].includes(
              String(invoice.status || ''),
            ),
          )
          .map((invoice) => coreInvoiceRow(invoice, true)),
      ];
    }
    if (view === 'Transactions') {
      return transactionRecords.map((transaction) =>
        transactionRow(transaction),
      );
    }
    if (view === 'Refunds') return refundRecords.map(refundRow);
    if (view === 'Disputes') {
      return transactionRecords
        .filter(
          (transaction) =>
            String(transaction.status || '') === 'disputed'
            || Boolean(String(transaction.disputeStatus || '').trim()),
        )
        .map((transaction) => transactionRow(transaction, 'dispute'));
    }
    if (view === 'Deposits') {
      return depositRecords.map((deposit) =>
        depositRow(deposit, transactionRecords),
      );
    }
    if (view === 'Reconciliation') {
      return depositRecords.map((deposit) =>
        depositRow(deposit, transactionRecords, true),
      );
    }
    return [];
  }

  function buildLeadSummary(
    view: FinanceView,
    rows: FinanceTableRow[],
    refunds: FinanceRecord[],
  ) {
    const currencies = [
      ...new Set(rows.map((row) => row.currency).filter(Boolean)),
    ] as string[];
    const currency = currencies.length <= 1 ? currencies[0] || 'USD' : null;
    const sumOriginal = (
      sourceRows: FinanceTableRow[],
      field: string,
    ) => {
      const values = sourceRows.map((row) =>
        safeMinorUnits((row.original as FinanceRecord)[field]),
      );
      if (values.some((value) => value === null)) return null;
      return values.reduce<number>(
        (total, value) => total + (value ?? 0),
        0,
      );
    };
    if (view === 'Outstanding') {
      const now = Date.now();
      const overdue = rows.filter((row) => {
        const original = row.original as FinanceRecord;
        const dueAt = original.dueAt || original.dueDate;
        if (!dueAt || (row.secondaryCents ?? 0) <= 0) return false;
        const due = new Date(String(dueAt)).getTime();
        return Number.isFinite(due) && due < now;
      }).length;
      const unpaidRegistrations = rows.filter((row) => {
        const original = row.original as FinanceRecord;
        return String(original.sourceType || '').toLowerCase() === 'registration'
          || row.kind === 'core_invoice';
      }).length;
      const scheduledPayments = rows.filter((row) => {
        const original = row.original as FinanceRecord;
        return Boolean(
          original.scheduleId
          || original.installmentId
          || original.scheduledAt,
        );
      }).length;
      return {
        currency,
        metrics: [
          { label: 'Overdue invoices', kind: 'count', value: overdue },
          { label: 'Unpaid registrations', kind: 'count', value: unpaidRegistrations },
          { label: 'Scheduled payments', kind: 'count', value: scheduledPayments },
        ],
      };
    }
    if (view === 'Transactions') {
      const succeeded = rows.filter((row) =>
        String(row.status).toLowerCase() === 'succeeded',
      );
      const refundValues = refunds
        .filter((refund) => String(refund.status || '').toLowerCase() === 'succeeded')
        .map((refund) => safeMinorUnits(refund.amountCents));
      const refunded = refundValues.some((value) => value === null)
        ? null
        : refundValues.reduce<number>(
            (total, value) => total + (value ?? 0),
            0,
          );
      return {
        currency,
        metrics: [
          { label: 'Gross', kind: 'amount', value: sumOriginal(succeeded, 'grossAmount') },
          { label: 'Net', kind: 'amount', value: sumOriginal(succeeded, 'netAmount') },
          { label: 'Fees', kind: 'amount', value: sumOriginal(succeeded, 'feeAmount') },
          { label: 'Refunds', kind: 'amount', value: refunded },
          { label: 'Failed', kind: 'count', value: rows.filter((row) => String(row.status).toLowerCase() === 'failed').length },
        ],
      };
    }
    return {
      currency,
      metrics: [
        { label: 'Gross', kind: 'amount', value: sumOriginal(rows, 'totalGross') },
        { label: 'Net', kind: 'amount', value: sumOriginal(rows, 'totalNet') },
        { label: 'Fees', kind: 'amount', value: sumOriginal(rows, 'totalFees') },
      ],
    };
  }

  function leadMetricValue(
    metric: { kind: string; value: number | null },
    currency: string | null,
  ) {
    if (metric.kind === 'count') {
      return (metric.value ?? 0).toLocaleString();
    }
    if (metric.value === null) return 'Pending';
    return currency ? formatMinorUnits(metric.value, currency) : 'Multiple';
  }

  function recordTypeLabel(view: FinanceView) {
    const labels: Record<FinanceView, string> = {
      Overview: 'financial',
      Invoices: 'invoice',
      Outstanding: 'outstanding',
      Transactions: 'transaction',
      Refunds: 'refund',
      Disputes: 'dispute',
      Deposits: 'deposit',
      Reconciliation: 'reconciliation',
    };
    return labels[view];
  }

  function financialColumnLabels(view: FinanceView) {
    if (view === 'Deposits' || view === 'Reconciliation') {
      return {
        date: 'Deposit date',
        record: 'Deposit account',
        party: 'Type',
        context: 'Details',
        primary: 'Gross',
        secondary: view === 'Reconciliation' ? 'Variance' : 'Net',
      };
    }
    if (view === 'Outstanding') {
      return {
        date: 'Due date',
        record: 'Program',
        party: 'Source',
        context: 'Member / type',
        primary: 'Invoiced',
        secondary: 'Due',
      };
    }
    if (view === 'Transactions' || view === 'Disputes') {
      return {
        date: 'Payment date',
        record: 'Program',
        party: 'Source',
        context: 'Member / type',
        primary: 'Gross',
        secondary: 'Net',
      };
    }
    return {
      date: 'Date',
      record: 'Record',
      party: 'Party / source',
      context: 'Context',
      primary: 'Amount',
      secondary: 'Balance / net',
    };
  }

  function filterAndSortRows(
    rows: FinanceTableRow[],
    search: string,
    status: string,
    currency: string,
    startDate: string,
    endDate: string,
    nextSortKey: SortKey,
    nextSortDirection: 'asc' | 'desc',
  ) {
    const query = search.trim().toLowerCase();
    const start = startDate
      ? new Date(`${startDate}T00:00:00`).getTime()
      : null;
    const end = endDate
      ? new Date(`${endDate}T23:59:59.999`).getTime()
      : null;
    return rows
      .filter((row) => {
        if (status && row.status !== status) return false;
        if (currency && row.currency !== currency) return false;
        if (query) {
          const haystack = [
            row.id,
            row.recordLabel,
            row.partyLabel,
            row.contextLabel,
            row.status,
            row.currency,
          ].join(' ').toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        const rowTime = row.dateIso ? new Date(row.dateIso).getTime() : null;
        if (start !== null && (rowTime === null || rowTime < start)) return false;
        if (end !== null && (rowTime === null || rowTime > end)) return false;
        return true;
      })
      .sort((left, right) => {
        let compared = 0;
        if (nextSortKey === 'primaryCents') {
          compared =
            (left.primaryCents ?? Number.MAX_SAFE_INTEGER)
            - (right.primaryCents ?? Number.MAX_SAFE_INTEGER);
        } else {
          compared = String(left[nextSortKey] || '').localeCompare(
            String(right[nextSortKey] || ''),
          );
        }
        if (compared === 0) compared = left.id.localeCompare(right.id);
        return nextSortDirection === 'asc' ? compared : -compared;
      });
  }

  function setView(view: FinanceView) {
    activeView = view;
    filtersOpen = false;
    page = 1;
    selectedIds = new Set();
    statusFilter = '';
    currencyFilter = '';
    exportState = 'idle';
    exportMessage = '';
    syncUrl();
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput;
      page = 1;
      selectedIds = new Set();
      syncUrl();
    }, 200);
  }

  function applyFilters() {
    page = 1;
    selectedIds = new Set();
    syncUrl();
  }

  function clearFilters() {
    searchInput = '';
    searchQuery = '';
    statusFilter = '';
    currencyFilter = '';
    fromDate = '';
    toDate = '';
    page = 1;
    selectedIds = new Set();
    syncUrl();
  }

  function setSort(next: SortKey) {
    if (sortKey === next) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = next;
      sortDirection = next === 'dateIso' ? 'desc' : 'asc';
    }
    page = 1;
    syncUrl();
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleCurrentPage() {
    const next = new Set(selectedIds);
    if (currentPageSelected) currentPageIds.forEach((id) => next.delete(id));
    else currentPageIds.forEach((id) => next.add(id));
    selectedIds = next;
  }

  function toggleColumn(id: string) {
    const next = new Set(visibleColumns);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    visibleColumns = next;
    syncUrl();
  }

  function openDetails(row: FinanceTableRow) {
    selectedRow = row;
    createMode = false;
    detailsOpen = true;
    syncUrl();
  }

  function openCreateInvoice() {
    selectedRow = null;
    createMode = true;
    detailsOpen = true;
  }

  function closeDetails() {
    detailsOpen = false;
    createMode = false;
    selectedRow = null;
    syncUrl();
  }

  function restoreInvoiceDetail() {
    const requested = typeof window === 'undefined'
      ? ''
      : new URL(window.location.href).searchParams.get('financeInvoice');
    if (!requested) return;
    const invoice = !teamId && ownerAuthorized
      ? persistedDirectInvoice(requested, directInvoices)
      : null;
    if (invoice) {
      activeView = 'Invoices';
      selectedRow = directInvoiceRow(invoice);
      createMode = false;
      detailsOpen = true;
      syncUrl();
      return;
    }
    detailsOpen = false;
    selectedRow = null;
    syncUrl();
  }

  function selectedInvoiceIds(
    rows: FinanceTableRow[],
    selection: Set<string>,
  ) {
    const invoiceRows = rows.filter(
      (row) => row.kind === 'direct_invoice',
    );
    return selection.size > 0
      ? invoiceRows
          .filter((row) => selection.has(row.id))
          .map((row) => row.recordId || row.id)
      : invoiceRows.map((row) => row.recordId || row.id);
  }

  function downloadBackendCsv(csvBase64: string, filename: string) {
    const bytes = Uint8Array.from(atob(csvBase64), (character) =>
      character.charCodeAt(0),
    );
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportInvoices() {
    const tenantId = $tenantIdStore;
    const ids = [
      ...new Set(selectedInvoiceIds(filteredRows, selectedIds)),
    ].sort();
    if (!tenantId || activeView !== 'Invoices' || ids.length === 0) return;
    if (exportState === 'loading') return;
    const signature = invoiceExportSignature(tenantId, ids);
    if (signature !== exportKeySignature) {
      exportKeySignature = signature;
      exportOperationKey = createIdempotencyKey(
        'financial-invoice-export',
      );
    }
    const generation = exportGeneration;
    const operationKey = exportOperationKey;
    exportState = 'loading';
    exportMessage = '';
    exportRequestId = '';
    try {
      const result = await backendClient.createCrmExport(
        {
          tenantId,
          resourceId: 'invoices',
          visibleColumnIds: [
            'invoiceNumber',
            'recipientName',
            'recipientEmail',
            'status',
            'subtotalCents',
            'totalCents',
            'amountPaidCents',
            'amountRefundedCents',
            'amountDueCents',
            'dueAt',
            'createdAt',
          ],
          selection: { scope: 'explicit', ids },
          filter: { op: 'and', children: [] },
          sort: [{ columnId: 'createdAt', direction: 'desc' }],
          locale: navigator.language || 'en-US',
          timeZone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        operationKey,
      );
      if (
        generation !== exportGeneration
        || $tenantIdStore !== tenantId
        || invoiceExportSignature(
          tenantId,
          selectedInvoiceIds(filteredRows, selectedIds),
        ) !== signature
      ) return;
      downloadBackendCsv(
        result.csvBase64,
        `huddleway_invoices_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      exportState = 'success';
      exportMessage = `Audited export ${result.exportId} contains ${result.rowCount} ${result.rowCount === 1 ? 'invoice' : 'invoices'}.`;
    } catch (error) {
      if (
        generation !== exportGeneration
        || $tenantIdStore !== tenantId
        || invoiceExportSignature(
          tenantId,
          selectedInvoiceIds(filteredRows, selectedIds),
        ) !== signature
      ) return;
      exportState = 'error';
      if (error instanceof BackendApiError) {
        exportRequestId = error.requestId || '';
      } else {
        exportRequestId = '';
      }
      exportMessage =
        'The invoice export could not be created. Retry or contact support.';
    }
  }

  function financialTruncationWarnings(
    financialOverview: FinancialOverview | null,
    invoiceProjectionIncomplete: boolean,
    loadedDirectInvoiceCount: number,
  ) {
    if (!financialOverview) return [];
    const warnings: string[] = [];
    for (const [resource, truncated] of Object.entries(
      financialOverview.truncated,
    )) {
      if (truncated) {
        warnings.push(
          `${humanizeStatus(resource)} did not finish loading. Refresh before relying on this view.`,
        );
      }
    }
    if (invoiceProjectionIncomplete) {
      warnings.push(
        `Direct-invoice pagination stopped after ${loadedDirectInvoiceCount.toLocaleString()} loaded records; balances and rows may be incomplete.`,
      );
    }
    return warnings;
  }

  function savedViewStorageKey() {
    return `huddleway.finance.saved-views.${$tenantIdStore || 'none'}`;
  }

  function loadSavedViews() {
    savedViews = [];
    selectedSavedView = '';
    savedViewName = '';
    savedViewMessage = '';
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = JSON.parse(
        localStorage.getItem(savedViewStorageKey()) || '[]',
      );
      savedViews = Array.isArray(parsed)
        ? parsed.filter(isValidSavedView)
        : [];
    } catch {
      savedViews = [];
    }
  }

  function isValidSavedView(value: unknown): value is SavedView {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const view = value as Partial<SavedView>;
    const allowedSortKeys: SortKey[] = [
      'dateIso',
      'recordLabel',
      'status',
      'primaryCents',
    ];
    const allowedPageSizes = [25, 50, 100];
    const allowedColumnIds = new Set(allColumns.map((column) => column.id));
    return (
      typeof view.name === 'string'
      && view.name.trim().length > 0
      && view.name.length <= 60
      && typeof view.activeView === 'string'
      && views.includes(view.activeView as FinanceView)
      && typeof view.search === 'string'
      && typeof view.status === 'string'
      && typeof view.currency === 'string'
      && typeof view.fromDate === 'string'
      && typeof view.toDate === 'string'
      && typeof view.sortKey === 'string'
      && allowedSortKeys.includes(view.sortKey as SortKey)
      && (view.sortDirection === 'asc' || view.sortDirection === 'desc')
      && typeof view.pageSize === 'number'
      && allowedPageSizes.includes(view.pageSize)
      && Array.isArray(view.visibleColumns)
      && view.visibleColumns.length > 0
      && view.visibleColumns.every(
        (columnId) =>
          typeof columnId === 'string' && allowedColumnIds.has(columnId),
      )
    );
  }

  function saveLocalView() {
    const name = savedViewName.trim();
    if (!name || name.length > 60) {
      savedViewMessage = 'Enter a view name of 60 characters or fewer.';
      return;
    }
    const saved: SavedView = {
      name,
      activeView,
      search: searchQuery,
      status: statusFilter,
      currency: currencyFilter,
      fromDate,
      toDate,
      sortKey,
      sortDirection,
      pageSize,
      visibleColumns: [...visibleColumns],
    };
    const nextSavedViews = [
      ...savedViews.filter((view) => view.name !== name),
      saved,
    ].slice(-20);
    try {
      localStorage.setItem(
        savedViewStorageKey(),
        JSON.stringify(nextSavedViews),
      );
    } catch {
      savedViewMessage =
        'This view could not be saved in this browser. Check storage settings.';
      return;
    }
    savedViews = nextSavedViews;
    selectedSavedView = name;
    savedViewName = '';
    savedViewMessage =
      'View saved in this browser for the active organization.';
  }

  function applySavedView() {
    const saved = savedViews.find((view) => view.name === selectedSavedView);
    if (!saved) return;
    activeView = saved.activeView;
    searchInput = saved.search;
    searchQuery = saved.search;
    statusFilter = saved.status;
    currencyFilter = saved.currency;
    fromDate = saved.fromDate;
    toDate = saved.toDate;
    sortKey = saved.sortKey;
    sortDirection = saved.sortDirection;
    pageSize = saved.pageSize;
    visibleColumns = new Set(saved.visibleColumns);
    selectedIds = new Set();
    page = 1;
    savedViewMessage = `Applied local view “${saved.name}”.`;
    syncUrl();
  }

  function deleteSavedView() {
    if (!selectedSavedView) return;
    const deleted = selectedSavedView;
    const nextSavedViews = savedViews.filter(
      (view) => view.name !== deleted,
    );
    try {
      localStorage.setItem(
        savedViewStorageKey(),
        JSON.stringify(nextSavedViews),
      );
    } catch {
      savedViewMessage =
        'This view could not be deleted. Check storage settings.';
      return;
    }
    savedViews = nextSavedViews;
    selectedSavedView = '';
    savedViewMessage = `Deleted local view “${deleted}”.`;
  }

  function syncUrl() {
    if (!hydratedFromUrl || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('financeView', activeView);
    for (const [key, value] of [
      ['financeQ', searchQuery],
      ['financeStatus', statusFilter],
      ['financeCurrency', currencyFilter],
      ['financeFrom', fromDate],
      ['financeTo', toDate],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    const invoiceId = detailsOpen && selectedRow?.kind === 'direct_invoice'
      ? selectedRow.recordId
      : '';
    if (invoiceId && !teamId) {
      url.searchParams.set('financeInvoice', invoiceId);
    } else url.searchParams.delete('financeInvoice');
    window.history.replaceState({}, '', url);
  }

  function hydrateUrl() {
    if (typeof window === 'undefined') return;
    const params = new URL(window.location.href).searchParams;
    const requestedView = params.get('financeView') as FinanceView | null;
    if (requestedView && views.includes(requestedView)) activeView = requestedView;
    searchInput = params.get('financeQ') || '';
    searchQuery = searchInput;
    statusFilter = params.get('financeStatus') || '';
    currencyFilter = params.get('financeCurrency') || '';
    fromDate = params.get('financeFrom') || '';
    toDate = params.get('financeTo') || '';
    if (ownerAuthorized && loadState === 'ready') restoreInvoiceDetail();
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-gray-50">
  <header class="border-b border-gray-200 bg-white px-4 pt-3 sm:px-6">
    <div class="flex items-center justify-between gap-4 pb-2">
      <p class="text-xs text-gray-500">
        {teamId ? `Team ${teamLabel}` : 'Organization'}
        {#if lastLoadedAt} · {lastLoadedAt.toLocaleTimeString()}{/if}
      </p>
      <button
        type="button"
        class="crm-ui-button-secondary bg-white text-gray-800"
        disabled={loadState === 'loading' || !ownerAuthorized}
        on:click={loadFinancials}
      >
        {loadState === 'loading' ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>

    <nav class="grid grid-cols-3" aria-label="Financial views">
      {#each primaryViews as view}
        <button
          type="button"
          aria-pressed={activeView === view}
          class="border-b-4 px-3 py-4 text-base font-semibold transition-colors sm:text-lg {activeView === view ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-800 hover:border-gray-200'}"
          on:click={() => setView(view)}
        >
          {view}
        </button>
      {/each}
    </nav>
  </header>

  {#if !ownerAuthorized || loadState === 'permission'}
    <div class="m-4 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 sm:m-6" role="alert">
      <h2 class="font-semibold">Owner permission required</h2>
      <p class="mt-1">Financial data is restricted to organization owners. No records were requested.</p>
      {#if loadError}<p class="mt-2">{loadError}</p>{/if}
      {#if loadRequestId}<p class="mt-1 text-xs">Support request: {loadRequestId}</p>{/if}
    </div>
  {:else if loadState === 'loading' && !overview}
    <div class="m-4 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 sm:m-6" role="status">
      Loading tenant-scoped financial projections and direct invoices…
    </div>
  {:else if loadState === 'error'}
    <div class="m-4 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:m-6" role="alert">
      <h2 class="font-semibold">Financial records are unavailable</h2>
      <p class="mt-1">{loadError}</p>
      {#if loadRequestId}<p class="mt-1 text-xs">Support request: {loadRequestId}</p>{/if}
      <button type="button" class="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 font-medium" on:click={loadFinancials}>Retry</button>
    </div>
  {:else if loadState === 'ready' || (loadState === 'loading' && overview)}
    <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {#if teamId}
        <div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" role="status">
          Records without trustworthy team scope are hidden. Switch to organization scope; transaction and core-invoice rows remain limited to team {teamId}.
        </div>
      {/if}

      {#if truncationWarnings.length > 0}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p class="font-semibold">Loaded scope may be incomplete</p>
          <ul class="mt-1 list-disc space-y-1 pl-5">{#each truncationWarnings as warning}<li>{warning}</li>{/each}</ul>
          <p class="mt-2">Totals and filters cover only returned records.</p>
        </div>
      {/if}

      {#if primaryViews.includes(activeView)}
        <section aria-label={`${activeView} summary`} class="rounded-xl border border-gray-200 bg-white shadow-sm">
          <dl class="grid divide-x divide-gray-200" style="grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));">
            {#each leadSummary.metrics as metric}
              <div class="px-4 py-5 text-center sm:px-8 sm:py-7">
                <dt class="text-xs font-semibold uppercase tracking-wide text-gray-500 sm:text-sm">{metric.label}</dt>
                <dd class="mt-2 text-xl font-bold text-gray-950 sm:text-3xl">
                  {leadMetricValue(metric, leadSummary.currency)}
                </dd>
              </div>
            {/each}
          </dl>
        </section>
      {/if}

      <section aria-label="Financial tools" class="mt-4 flex flex-wrap items-center gap-2">
        {#each toolViews as tool}
          <button
            type="button"
            aria-pressed={activeView === tool.view}
            class="rounded-lg border px-3 py-2 text-sm font-semibold {activeView === tool.view ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}"
            on:click={() => setView(tool.view)}
          >
            {tool.label}
          </button>
        {/each}
        <button
          type="button"
          class="rounded-lg bg-[#008194] px-3 py-2 text-sm font-semibold text-white hover:bg-[#006d7c] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!ownerAuthorized || Boolean(teamId) || loadState !== 'ready'}
          title={teamId ? 'Switch to organization scope to create a tenant-scoped invoice.' : undefined}
          on:click={openCreateInvoice}
        >
          Create
        </button>
      </section>

      {#if activeView === 'Overview'}
        <section aria-label="Financial periods">
          {#if !teamId}
            <FinancialPeriodManager
              tenantId={$tenantIdStore}
              on:changed={loadFinancials}
            />
          {:else}
            <div class="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
              Financial periods are organization-wide. Switch to organization scope to review or change locks.
            </div>
          {/if}
        </section>
      {:else}
        <section aria-labelledby="financial-table-heading" class="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="border-b border-gray-200 p-4">
            <h2 id="financial-table-heading" class="sr-only">{activeView}</h2>
            <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <p class="text-sm font-medium text-gray-700">
                {filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <div class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2">
                  <label for="financial-from" class="sr-only">From date</label>
                  <input id="financial-from" type="date" bind:value={fromDate} on:change={applyFilters} class="min-w-0 border-0 bg-transparent px-1 py-2 text-sm text-gray-800" />
                  <span class="text-gray-400">–</span>
                  <label for="financial-to" class="sr-only">To date</label>
                  <input id="financial-to" type="date" bind:value={toDate} on:change={applyFilters} class="min-w-0 border-0 bg-transparent px-1 py-2 text-sm text-gray-800" />
                </div>
                <button
                  type="button"
                  class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  aria-expanded={filtersOpen}
                  on:click={() => filtersOpen = !filtersOpen}
                >
                  Filters
                </button>
                {#if activeView === 'Invoices'}
                <button
                  type="button"
                  class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={filteredRows.length === 0 || exportState === 'loading'}
                  on:click={exportInvoices}
                >
                  {exportState === 'loading' ? 'Exporting…' : 'Export'}
                </button>
                {/if}
              </div>
            </div>

            {#if filtersOpen}
              <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div class="xl:col-span-2">
                    <label for="financial-search" class="crm-ui-label-xs">Search</label>
                    <input id="financial-search" type="search" bind:value={searchInput} on:input={handleSearchInput} placeholder="Record, person, or status" class="crm-ui-input mt-1 bg-white" aria-label="Search loaded records" />
                  </div>
                  <div>
                    <label for="financial-status" class="crm-ui-label-xs">Status</label>
                    <select id="financial-status" bind:value={statusFilter} on:change={applyFilters} class="crm-ui-input mt-1 bg-white"><option value="">All statuses</option>{#each statusOptions as status}<option value={status}>{humanizeStatus(status)}</option>{/each}</select>
                  </div>
                  <div>
                    <label for="financial-currency" class="crm-ui-label-xs">Currency</label>
                    <select id="financial-currency" bind:value={currencyFilter} on:change={applyFilters} class="crm-ui-input mt-1 bg-white"><option value="">All currencies</option>{#each currencyOptions as currency}<option value={currency}>{currency}</option>{/each}</select>
                  </div>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div><label for="financial-page-size" class="crm-ui-label-xs">Rows</label><select id="financial-page-size" bind:value={pageSize} on:change={() => { page = 1; syncUrl(); }} class="crm-ui-input mt-1 bg-white"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div>
                  <div><label for="financial-sort" class="crm-ui-label-xs">Sort</label><select id="financial-sort" bind:value={sortKey} on:change={() => { page = 1; syncUrl(); }} class="crm-ui-input mt-1 bg-white"><option value="dateIso">Date</option><option value="recordLabel">Record</option><option value="status">Status</option><option value="primaryCents">Amount</option></select></div>
                  <div class="flex items-end">
                    <details class="relative w-full">
                      <summary class="crm-ui-button-secondary cursor-pointer bg-white text-center text-gray-800">Columns</summary>
                      <div class="absolute left-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                        {#each allColumns as column}
                          <label class="flex items-center gap-2 py-1 text-sm text-gray-800">
                            <input type="checkbox" checked={visibleColumns.has(column.id)} disabled={visibleColumns.size === 1 && visibleColumns.has(column.id)} on:change={() => toggleColumn(column.id)} />
                            {column.label}
                          </label>
                        {/each}
                      </div>
                    </details>
                  </div>
                  <div class="flex items-end"><button type="button" on:click={clearFilters} disabled={!searchQuery && !statusFilter && !currencyFilter && !fromDate && !toDate} class="crm-ui-button-secondary w-full bg-white">Clear</button></div>
                </div>

                <div class="mt-3 grid gap-3 border-t border-gray-200 pt-3 lg:grid-cols-[1fr_auto_auto]">
                  <div><label for="saved-financial-view" class="crm-ui-label-xs">Saved view</label><select id="saved-financial-view" bind:value={selectedSavedView} class="crm-ui-select mt-1 bg-white" aria-label="Local saved view"><option value="">Choose</option>{#each savedViews as saved}<option value={saved.name}>{saved.name}</option>{/each}</select></div>
                  <div class="flex items-end gap-2"><button type="button" disabled={!selectedSavedView} on:click={applySavedView} class="crm-ui-button-secondary bg-white">Apply</button><button type="button" disabled={!selectedSavedView} on:click={deleteSavedView} class="crm-ui-button-danger-outline bg-white">Delete</button></div>
                  <div class="flex items-end gap-2"><div><label for="save-financial-view-name" class="crm-ui-label-xs">Save view</label><input id="save-financial-view-name" aria-label="Save current filters locally" bind:value={savedViewName} maxlength="60" class="crm-ui-input mt-1 bg-white" placeholder="Name" /></div><button type="button" disabled={!savedViewName.trim()} on:click={saveLocalView} class="crm-ui-button-secondary bg-white">Save</button></div>
                </div>
                {#if savedViewMessage}<p class="mt-2 text-xs text-gray-600" role="status">{savedViewMessage}</p>{/if}
              </div>
            {/if}
            {#if exportMessage}<div class="crm-ui-operation-message mt-3 {exportState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={exportState === 'error' ? 'alert' : 'status'}>{exportMessage}{#if exportRequestId}<span class="block text-xs">Support request: {exportRequestId}</span>{/if}</div>{/if}
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="overflow-x-auto" role="region" tabindex="0" aria-label="Scrollable financial records table">
            <table class="crm-ui-table">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="w-12 px-4 py-3 text-left"><input type="checkbox" aria-label="Select every row on this page" checked={currentPageSelected} disabled={pagedRows.length === 0} on:change={toggleCurrentPage} /></th>
                  {#if visibleColumns.has('date')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('dateIso')}>{tableLabels.date} {sortKey === 'dateIso' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('record')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('recordLabel')}>{tableLabels.record} {sortKey === 'recordLabel' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('party')}<th scope="col" class="crm-ui-th">{tableLabels.party}</th>{/if}
                  {#if visibleColumns.has('context')}<th scope="col" class="crm-ui-th">{tableLabels.context}</th>{/if}
                  {#if visibleColumns.has('status')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('status')}>Status {sortKey === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('primary')}<th scope="col" class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600"><button type="button" on:click={() => setSort('primaryCents')}>{tableLabels.primary} {sortKey === 'primaryCents' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if activeView === 'Deposits'}<th scope="col" class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Fees</th>{/if}
                  {#if visibleColumns.has('secondary')}<th scope="col" class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">{tableLabels.secondary}</th>{/if}
                  <th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 bg-white">
                {#each pagedRows as row (row.id)}
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3"><input type="checkbox" aria-label={`Select ${row.recordLabel}`} checked={selectedIds.has(row.id)} on:change={() => toggleSelection(row.id)} /></td>
                    {#if visibleColumns.has('date')}<td data-label="Date" class="px-4 py-3 text-sm text-gray-700">{row.dateLabel}</td>{/if}
                    {#if visibleColumns.has('record')}<td data-label="Record" class="px-4 py-3 text-sm font-medium text-gray-950">{row.recordLabel}<span class="block text-xs font-normal text-gray-500">{humanizeStatus(row.kind)}</span></td>{/if}
                    {#if visibleColumns.has('party')}<td data-label="Party / source" class="px-4 py-3 text-sm text-gray-700">{row.partyLabel}</td>{/if}
                    {#if visibleColumns.has('context')}<td data-label="Context" class="max-w-xs px-4 py-3 text-sm text-gray-700">{row.contextLabel}</td>{/if}
                    {#if visibleColumns.has('status')}<td data-label="Status" class="px-4 py-3 text-sm"><span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">{humanizeStatus(row.status)}</span></td>{/if}
                    {#if visibleColumns.has('primary')}<td data-label={row.primaryLabel} class="px-4 py-3 text-right text-sm font-medium text-gray-950">{formatMinorUnits(row.primaryCents, row.currency)}</td>{/if}
                    {#if activeView === 'Deposits'}<td data-label="Fees" class="px-4 py-3 text-right text-sm text-gray-700">{formatMinorUnits((row.original as FinanceRecord).totalFees, row.currency)}</td>{/if}
                    {#if visibleColumns.has('secondary')}<td data-label={row.secondaryLabel} class="px-4 py-3 text-right text-sm text-gray-700">{formatMinorUnits(row.secondaryCents, row.currency)}</td>{/if}
                    <td class="px-4 py-3 text-right"><button type="button" class="crm-ui-button-secondary px-2 py-1 text-gray-800 hover:bg-gray-100" on:click={() => openDetails(row)}>View</button></td>
                  </tr>
                {/each}
                {#if pagedRows.length === 0}
                  <tr><td colspan={visibleColumns.size + 2 + (activeView === 'Deposits' ? 1 : 0)} class="px-6 py-10 text-center text-sm text-gray-600">{baseRows.length === 0 ? `No ${recordTypeLabel(activeView)} records are available.` : 'No records match the current filters.'}</td></tr>
                {/if}
              </tbody>
            </table>
          </div>

          <footer class="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm text-gray-600">Page {page} of {pageCount} · {selectedIds.size} selected</p>
            <div class="flex gap-2">
              <button type="button" disabled={page <= 1} on:click={() => { page -= 1; syncUrl(); }} class="crm-ui-button-secondary py-1.5">Previous</button>
              <button type="button" disabled={page >= pageCount} on:click={() => { page += 1; syncUrl(); }} class="crm-ui-button-secondary py-1.5">Next</button>
            </div>
          </footer>
        </section>
      {/if}
    </div>
  {/if}
</div>

<TransactionDetails
  open={detailsOpen}
  row={selectedRow}
  {createMode}
  tenantId={$tenantIdStore}
  {ownerAuthorized}
  on:close={closeDetails}
  on:changed={loadFinancials}
  on:created={loadFinancials}
/>

<style>
  @media (max-width: 767px) {
    table, thead, tbody, th, td, tr { display: block; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    tbody tr { border-bottom: 1px solid rgb(229 231 235); padding: 0.5rem 0; }
    tbody td { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding-top: 0.5rem; padding-bottom: 0.5rem; text-align: right; }
    tbody td[data-label]::before { content: attr(data-label); flex: none; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(107 114 128); }
  }
</style>
