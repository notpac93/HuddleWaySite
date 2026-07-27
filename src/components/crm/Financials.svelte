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
    reconcileDeposit,
    safeCurrency,
    safeMinorUnits,
    summarizeFinancialsByCurrency,
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

  let activeView: FinanceView = 'Overview';
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
  $: summaryResult = summarizeFinancialsByCurrency({
    transactions: scopedTransactions,
    refunds: scopedRefunds,
    directInvoices: scopedDirectInvoices,
  });
  $: baseRows = buildRows(
    activeView,
    scopedDirectInvoices,
    scopedCoreInvoices,
    scopedTransactions,
    scopedRefunds,
    scopedDeposits,
  );
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
    return 'Financial records could not be loaded. Retry or contact support if the problem continues.';
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
        backendClient.financialOverview(tenantId, 1000),
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
    const maximumLoadedRecords = 5_000;

    while (invoices.length < maximumLoadedRecords) {
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
        if (invoices.length >= maximumLoadedRecords) break;
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

    return { invoices, incomplete: true };
  }

  function rowCurrency(record: FinanceRecord) {
    return safeCurrency(record.currency);
  }

  function coreParty(record: FinanceRecord) {
    return (
      String(record.userId || '').trim()
      || String(record.invoiceId || '').trim()
      || 'Party unavailable'
    );
  }

  function coreContext(record: FinanceRecord) {
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

  function directInvoiceRow(invoice: DirectInvoiceRecord): FinanceTableRow {
    return {
      id: `direct_invoice:${invoice.id}`,
      recordId: invoice.id,
      kind: 'direct_invoice',
      dateIso: invoice.createdAt,
      dateLabel: dateLabel(invoice.createdAt),
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

  function coreInvoiceRow(invoice: FinanceRecord): FinanceTableRow {
    const currency = rowCurrency(invoice);
    const recordId = String(invoice.id || '');
    return {
      id: `core_invoice:${recordId}`,
      recordId,
      kind: 'core_invoice',
      dateIso: recordIso(invoice, 'createdAt', 'updatedAt'),
      dateLabel: dateLabel(invoice.createdAt || invoice.updatedAt),
      recordLabel: String(invoice.id || 'Invoice'),
      partyLabel: coreParty(invoice),
      contextLabel: coreContext(invoice),
      status: String(invoice.status || 'unavailable'),
      currency,
      primaryCents: safeMinorUnits(invoice.amountPaid),
      secondaryCents: safeMinorUnits(invoice.amountDue),
      primaryLabel: 'Amount paid',
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
      recordLabel: String(transaction.id || 'Transaction'),
      partyLabel: coreParty(transaction),
      contextLabel:
        kind === 'dispute'
          ? `Processor dispute · ${coreContext(transaction)}`
          : `${humanizeStatus(transaction.paymentMethodType)} · ${coreContext(transaction)}`,
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
      recordLabel: String(deposit.id || 'Payout'),
      partyLabel: String(deposit.gateway || 'Gateway unavailable'),
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
      return directInvoiceRecords.map(directInvoiceRow);
    }
    if (view === 'Outstanding') {
      return [
        ...directInvoiceRecords
          .filter((invoice) =>
            ['open', 'partially_paid', 'past_due'].includes(invoice.status),
          )
          .map(directInvoiceRow),
        ...coreInvoiceRecords
          .filter((invoice) =>
            ['open', 'partially_paid', 'past_due'].includes(
              String(invoice.status || ''),
            ),
          )
          .map(coreInvoiceRow),
      ];
    }
    if (view === 'Transactions') return transactionRecords.map(transactionRow);
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
        'The invoice export could not be created. Retry or contact support if the problem continues.';
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
          `${humanizeStatus(resource)} reached the 1,000-record projection limit.`,
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
        'This view could not be saved in this browser. Check browser storage settings and try again.';
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
        'This view could not be deleted from browser storage. Check browser storage settings and try again.';
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
    if (searchQuery) url.searchParams.set('financeQ', searchQuery);
    else url.searchParams.delete('financeQ');
    if (statusFilter) url.searchParams.set('financeStatus', statusFilter);
    else url.searchParams.delete('financeStatus');
    if (currencyFilter) {
      url.searchParams.set('financeCurrency', currencyFilter);
    } else url.searchParams.delete('financeCurrency');
    if (fromDate) url.searchParams.set('financeFrom', fromDate);
    else url.searchParams.delete('financeFrom');
    if (toDate) url.searchParams.set('financeTo', toDate);
    else url.searchParams.delete('financeTo');
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
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-gray-50">
  <header class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-[#008194]">Owner-only financial operations</p>
        <h1 class="mt-1 text-2xl font-semibold text-gray-950">Financials</h1>
        <p class="mt-1 text-sm text-gray-600">
          Scope: {teamId ? `Team ${teamLabel}` : 'entire organization'} ·
          {lastLoadedAt ? ` refreshed ${lastLoadedAt.toLocaleTimeString()}` : ' not refreshed'}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="crm-ui-button-secondary bg-white text-gray-800"
          disabled={loadState === 'loading' || !ownerAuthorized}
          on:click={loadFinancials}
        >
          {loadState === 'loading' ? 'Refreshing…' : 'Refresh financials'}
        </button>
        <button
          type="button"
          class="rounded-md bg-[#008194] px-3 py-2 text-sm font-semibold text-white hover:bg-[#006d7c] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!ownerAuthorized || Boolean(teamId) || loadState !== 'ready'}
          title={teamId ? 'Switch to organization scope to create a tenant-scoped invoice.' : undefined}
          on:click={openCreateInvoice}
        >
          Create invoice draft
        </button>
      </div>
    </div>

    <nav class="mt-4 flex gap-1 overflow-x-auto" aria-label="Financial views">
      {#each views as view}
        <button
          type="button"
          aria-pressed={activeView === view}
          class="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium {activeView === view ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}"
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
      <p class="mt-1">Financial projections and mutations are restricted to organization owners. No financial records were requested for this role.</p>
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
          Direct invoices, refunds, disputes, and payouts do not expose a trustworthy team scope in the current backend projection, so those records are hidden here. Switch to organization scope to manage them; transaction and core-invoice rows remain limited to team ID {teamId}.
        </div>
      {/if}

      {#if truncationWarnings.length > 0}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p class="font-semibold">Loaded scope may be incomplete</p>
          <ul class="mt-1 list-disc space-y-1 pl-5">{#each truncationWarnings as warning}<li>{warning}</li>{/each}</ul>
          <p class="mt-2">Totals and client-side filters cover only the returned projection. No full-scope claim or export is made.</p>
        </div>
      {/if}

      {#if activeView === 'Overview'}
        <section aria-labelledby="financial-overview-heading">
          <div class="flex items-end justify-between gap-4">
            <div>
              <h2 id="financial-overview-heading" class="text-lg font-semibold text-gray-950">Currency-safe overview</h2>
              <p class="mt-1 text-sm text-gray-600">Successful payments, fees, refunds, and direct-invoice balances remain separate. Bank payouts are not inferred from payment success.</p>
            </div>
          </div>

          {#if summaryResult.excludedRecordCount > 0}
            <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
              {summaryResult.excludedRecordCount} financial {summaryResult.excludedRecordCount === 1 ? 'record was' : 'records were'} excluded because currency or integer minor-unit amounts were invalid.
            </div>
          {/if}

          {#if summaryResult.summaries.length === 0}
            <div class="mt-4 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
              No successful payment, refund, or outstanding direct-invoice totals are available for this scope.
            </div>
          {:else}
            <div class="mt-4 grid gap-4 xl:grid-cols-2">
              {#each summaryResult.summaries as summary (summary.currency)}
                <article class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div class="crm-ui-between"><h3 class="font-semibold text-gray-950">{summary.currency} {truncationWarnings.length > 0 ? 'loaded projection' : 'totals'}</h3><span class="crm-ui-hint-xs">{teamId ? `Team ${teamLabel}` : 'Organization'}</span></div>
                  <dl class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
                    <div><dt class="crm-ui-eyebrow">Collected</dt><dd class="mt-1 text-lg font-semibold">{formatMinorUnits(summary.collectedCents, summary.currency)}</dd></div>
                    <div><dt class="crm-ui-eyebrow">Fees</dt><dd class="mt-1 text-lg font-semibold">{formatMinorUnits(summary.feeCents, summary.currency)}</dd></div>
                    <div><dt class="crm-ui-eyebrow">Net</dt><dd class="mt-1 text-lg font-semibold">{formatMinorUnits(summary.netCents, summary.currency)}</dd></div>
                    <div><dt class="crm-ui-eyebrow">Refunded</dt><dd class="mt-1 text-lg font-semibold">{formatMinorUnits(summary.refundedCents, summary.currency)}</dd></div>
                    <div><dt class="crm-ui-eyebrow">Outstanding</dt><dd class="mt-1 text-lg font-semibold">{formatMinorUnits(summary.outstandingCents, summary.currency)}</dd></div>
                  </dl>
                </article>
              {/each}
            </div>
          {/if}

          <div class="mt-6 grid gap-4 lg:grid-cols-2">
            <article class="rounded-xl border border-gray-200 bg-white p-5">
              <h3 class="font-semibold text-gray-950">Launch capability boundary</h3>
              <p class="mt-2 text-sm text-gray-700">HuddleWay supports direct invoices, authoritative balances, offline payment records, processor refunds, dispute status, deposits, and reconciliation views in this release.</p>
              <p class="mt-2 text-sm text-gray-700">Configurable installment schedules, autopay plans, scholarships, credits, and financial-aid adjustments are not shipped. Recurring subscriptions are not presented as invoice installments.</p>
            </article>
            <article class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <h3 class="font-semibold text-emerald-950">Audited financial period locks</h3>
              <p class="mt-2 text-sm text-emerald-900">Owners can preview, close, and reopen half-open financial date ranges. The backend rejects covered administrative financial mutations and records close/reopen audit events.</p>
            </article>
          </div>

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
            <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 id="financial-table-heading" class="text-lg font-semibold text-gray-950">{activeView}</h2>
                <p class="mt-1 text-sm text-gray-600">{filteredRows.length} matching {filteredRows.length === 1 ? 'record' : 'records'} in the loaded {teamId ? 'team' : 'organization'} projection.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <details class="relative">
                  <summary class="crm-ui-button-secondary cursor-pointer text-gray-800">Columns</summary>
                  <div class="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                    {#each allColumns as column}
                      <label class="flex items-center gap-2 py-1 text-sm text-gray-800">
                        <input type="checkbox" checked={visibleColumns.has(column.id)} disabled={visibleColumns.size === 1 && visibleColumns.has(column.id)} on:change={() => toggleColumn(column.id)} />
                        {column.label}
                      </label>
                    {/each}
                  </div>
                </details>
                <button
                  type="button"
                  class="crm-ui-button-secondary text-gray-800"
                  disabled={activeView !== 'Invoices' || filteredRows.length === 0 || exportState === 'loading'}
                  title={activeView !== 'Invoices' ? 'Only direct invoices have an audited backend export contract in this release.' : undefined}
                  on:click={exportInvoices}
                >
                  {exportState === 'loading' ? 'Exporting…' : selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export filtered invoices'}
                </button>
              </div>
            </div>

            <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div class="xl:col-span-2">
                <label for="financial-search" class="crm-ui-label-xs">Search loaded records</label>
                <div class="mt-1 flex gap-2">
                  <input id="financial-search" type="search" bind:value={searchInput} on:input={handleSearchInput} placeholder="Record, party, context, or status" class="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  <button type="button" disabled={!searchInput && !searchQuery} on:click={() => { searchInput = ''; searchQuery = ''; applyFilters(); }} class="crm-ui-button-secondary">Clear</button>
                </div>
              </div>
              <div>
                <label for="financial-status" class="crm-ui-label-xs">Status</label>
                <select id="financial-status" bind:value={statusFilter} on:change={applyFilters} class="crm-ui-input"><option value="">All statuses</option>{#each statusOptions as status}<option value={status}>{humanizeStatus(status)}</option>{/each}</select>
              </div>
              <div>
                <label for="financial-currency" class="crm-ui-label-xs">Currency</label>
                <select id="financial-currency" bind:value={currencyFilter} on:change={applyFilters} class="crm-ui-input"><option value="">All currencies</option>{#each currencyOptions as currency}<option value={currency}>{currency}</option>{/each}</select>
              </div>
              <div class="flex items-end"><button type="button" on:click={clearFilters} disabled={!searchQuery && !statusFilter && !currencyFilter && !fromDate && !toDate} class="crm-ui-button-secondary w-full">Clear all filters</button></div>
            </div>

            <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div><label for="financial-from" class="crm-ui-label-xs">From date</label><input id="financial-from" type="date" bind:value={fromDate} on:change={applyFilters} class="crm-ui-input" /></div>
              <div><label for="financial-to" class="crm-ui-label-xs">To date</label><input id="financial-to" type="date" bind:value={toDate} on:change={applyFilters} class="crm-ui-input" /></div>
              <div><label for="financial-page-size" class="crm-ui-label-xs">Rows per page</label><select id="financial-page-size" bind:value={pageSize} on:change={() => { page = 1; syncUrl(); }} class="crm-ui-input"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div>
              <div><label for="financial-sort" class="crm-ui-label-xs">Sort</label><select id="financial-sort" bind:value={sortKey} on:change={() => { page = 1; syncUrl(); }} class="crm-ui-input"><option value="dateIso">Date</option><option value="recordLabel">Record</option><option value="status">Status</option><option value="primaryCents">Amount</option></select></div>
            </div>

            <div class="mt-4 grid gap-3 rounded-lg bg-gray-50 p-3 lg:grid-cols-[1fr_auto_auto]">
              <div><label for="saved-financial-view" class="crm-ui-label-xs">Local saved view</label><select id="saved-financial-view" bind:value={selectedSavedView} class="crm-ui-select"><option value="">Choose a saved view</option>{#each savedViews as saved}<option value={saved.name}>{saved.name}</option>{/each}</select></div>
              <div class="flex items-end gap-2"><button type="button" disabled={!selectedSavedView} on:click={applySavedView} class="crm-ui-button-secondary bg-white">Apply</button><button type="button" disabled={!selectedSavedView} on:click={deleteSavedView} class="crm-ui-button-danger-outline bg-white">Delete</button></div>
              <div class="flex items-end gap-2"><div><label for="save-financial-view-name" class="crm-ui-label-xs">Save current filters locally</label><input id="save-financial-view-name" bind:value={savedViewName} maxlength="60" class="crm-ui-input bg-white" placeholder="View name" /></div><button type="button" disabled={!savedViewName.trim()} on:click={saveLocalView} class="crm-ui-button-secondary bg-white">Save</button></div>
            </div>
            {#if savedViewMessage}<p class="mt-2 text-xs text-gray-600" role="status">{savedViewMessage}</p>{/if}
            {#if exportMessage}<div class="crm-ui-operation-message mt-3 {exportState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={exportState === 'error' ? 'alert' : 'status'}>{exportMessage}{#if exportRequestId}<span class="block text-xs">Support request: {exportRequestId}</span>{/if}</div>{/if}
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div class="overflow-x-auto" role="region" tabindex="0" aria-label="Scrollable financial records table">
            <table class="crm-ui-table">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="w-12 px-4 py-3 text-left"><input type="checkbox" aria-label="Select every row on this page" checked={currentPageSelected} disabled={pagedRows.length === 0} on:change={toggleCurrentPage} /></th>
                  {#if visibleColumns.has('date')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('dateIso')}>Date {sortKey === 'dateIso' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('record')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('recordLabel')}>Record {sortKey === 'recordLabel' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('party')}<th scope="col" class="crm-ui-th">Party / source</th>{/if}
                  {#if visibleColumns.has('context')}<th scope="col" class="crm-ui-th">Context</th>{/if}
                  {#if visibleColumns.has('status')}<th scope="col" class="crm-ui-th"><button type="button" on:click={() => setSort('status')}>Status {sortKey === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('primary')}<th scope="col" class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600"><button type="button" on:click={() => setSort('primaryCents')}>Amount {sortKey === 'primaryCents' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button></th>{/if}
                  {#if visibleColumns.has('secondary')}<th scope="col" class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Balance / net</th>{/if}
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
                    {#if visibleColumns.has('secondary')}<td data-label={row.secondaryLabel} class="px-4 py-3 text-right text-sm text-gray-700">{formatMinorUnits(row.secondaryCents, row.currency)}</td>{/if}
                    <td class="px-4 py-3 text-right"><button type="button" class="crm-ui-button-secondary px-2 py-1 text-gray-800 hover:bg-gray-100" on:click={() => openDetails(row)}>View details</button></td>
                  </tr>
                {/each}
                {#if pagedRows.length === 0}
                  <tr><td colspan={visibleColumns.size + 2} class="px-6 py-10 text-center text-sm text-gray-600">{baseRows.length === 0 ? `No ${activeView.toLowerCase()} records are available in this authorized scope.` : 'No records match the current search and filters.'}</td></tr>
                {/if}
              </tbody>
            </table>
          </div>

          <footer class="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm text-gray-600">Page {page} of {pageCount} · {selectedIds.size} selected by stable record ID</p>
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
