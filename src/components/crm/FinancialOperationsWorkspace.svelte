<script lang="ts">
  import RecordToolbar from './ui/RecordToolbar.svelte';
  import RecordItem from './ui/RecordItem.svelte';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
  import { onMount } from 'svelte';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    type FinancialOperationRow,
    type FinancialOperations,
    type FinancialOperationView,
  } from '../../lib/api/BackendApi';
  import BillingPackagesWorkspace from './billing/BillingPackagesWorkspace.svelte';

  export let activeTeam: { id?: string; name?: string } | string | null = null;

  type WorkspaceView = FinancialOperationView | 'payment_setup';
  const views: Array<{ id: WorkspaceView; label: string }> = [
    { id: 'deposits', label: 'Deposits' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'payment_setup', label: 'Payment setup' },
  ];

  let activeView: WorkspaceView = 'deposits';
  let operations: FinancialOperations | null = null;
  let loading = false;
  let errorMessage = '';
  let search = '';
  let status = '';
  let loadedTenantId = '';
  let requestGeneration = 0;
  let requestingTenant = '';
  let snapshotTenant = '';


  $: ownerAuthorized = $activeTenantRole === 'owner' || $activeTenantRole === 'platform_admin';
  $: rows = activeView === 'payment_setup' ? [] : operations?.views[activeView] || [];
  $: statusOptions = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  $: filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    if (status && row.status !== status) return false;
    if (!query) return true;
    return [row.label, row.context, row.statusLabel, row.detail, row.dateLabel]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  $: visibleTotal = filteredRows.reduce((sum, row) =>
    Number.isSafeInteger(row.amountCents) ? sum + Number(row.amountCents) : sum, 0);
  $: if ($tenantIdStore && $tenantIdStore !== loadedTenantId && ownerAuthorized) {
    loadedTenantId = $tenantIdStore;
    void loadOperations();
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    const requested = new URL(window.location.href).searchParams.get('financeView')?.toLowerCase();
    if (requested === 'outstanding') activeView = 'overdue';
    else if (views.some((view) => view.id === requested)) activeView = requested as WorkspaceView;
  });

  function setView(view: WorkspaceView) {
    activeView = view;
    search = '';
    status = '';
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('financeView', view);
      window.history.replaceState({}, '', url);
    }
  }

  function money(cents: number | null, currency: string | null) {
    if (!Number.isSafeInteger(cents) || !/^[A-Z]{3}$/.test(String(currency || ''))) return 'Unavailable';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency),
    }).format(Number(cents) / 100);
  }

  function humanStatus(value: string) {
    return value.split('_').filter(Boolean).map((part) =>
      part.charAt(0).toUpperCase() + part.slice(1),
    ).join(' ') || 'Not recorded';
  }

  async function loadOperations() {
    const tenantId = $tenantIdStore;
    if (!tenantId || !ownerAuthorized || (loading && requestingTenant === tenantId)) return;
    const generation = ++requestGeneration;
    requestingTenant = tenantId;
    if (snapshotTenant !== tenantId) operations = null;
    loading = true;
    errorMessage = '';
    try {
      const overview = await backendClient.financialOverview(tenantId);
      if ($tenantIdStore !== tenantId || generation !== requestGeneration || !ownerAuthorized) return;
      snapshotTenant = tenantId;
      operations = overview.operations;
    } catch (error) {
      if ($tenantIdStore !== tenantId || generation !== requestGeneration) return;
      if (error instanceof BackendApiError && [401, 403].includes(error.status)) operations = null;
      errorMessage = error instanceof BackendApiError
        ? 'Financial operations could not be loaded. Retry or contact support.'
        : 'Financial operations could not be loaded. Retry.';
    } finally {
      if ($tenantIdStore === tenantId && generation === requestGeneration) loading = false;
    }
  }

  function csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportVisibleRows() {
    if (!operations?.complete || activeView === 'payment_setup' || filteredRows.length === 0) return;
    const lines = [
      ['Date', 'Record', 'Context', 'Status', 'Amount', 'Currency', 'Details'],
      ...filteredRows.map((row) => [
        row.dateLabel,
        row.label,
        row.context,
        row.statusLabel,
        row.amountCents ?? '',
        row.currency ?? '',
        row.detail,
      ]),
    ].map((line) => line.map(csvCell).join(','));
    const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `huddleway-${activeView}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function rowKey(row: FinancialOperationRow) {
    return row.key;
  }

  mountRefresh(() => registerLiveRefresh(() => loadOperations()));
</script>

<div class="flex h-full min-h-0 flex-col bg-gray-50">
  <header class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 class="crm-ui-page-title">Financials</h1>
      </div>

    </div>
    <RecordToolbar activeCount={[search.trim(), status].filter(Boolean).length} searchable={ownerAuthorized && activeView !== 'payment_setup' && (rows.length > 0 || Boolean(search || status))}>
      <select slot="view" aria-label="Financial operation view" value={activeView} on:change={(event) => setView(event.currentTarget.value as WorkspaceView)}>
        {#each views as view}<option value={view.id}>{view.label}</option>{/each}
      </select>
      <div class="grid gap-3 sm:grid-cols-2">
        <label>Search<input class="crm-ui-input w-full bg-white" type="search" bind:value={search} placeholder="Search records" /></label>
        <label>Status<select class="crm-ui-input w-full bg-white" bind:value={status}><option value="">All statuses</option>{#each statusOptions as option}<option value={option}>{humanStatus(option)}</option>{/each}</select></label>
        {#if search || status}<button type="button" class="justify-self-start text-sm font-semibold" on:click={() => { search = ''; status = ''; }}>Clear filters</button>{/if}
        {#if rows.length > 0}<button type="button" class="justify-self-start crm-ui-button-secondary bg-white" disabled={!operations?.complete || filteredRows.length === 0} on:click={exportVisibleRows}>Export</button>{/if}
      </div>
    </RecordToolbar>
  </header>

  <main class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
    {#if !ownerAuthorized}
      <section class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950" role="alert">
        <h2 class="font-semibold">Owner permission required</h2>
        <p class="mt-1">Financial records are available only to organization owners. No financial request was made.</p>
      </section>
    {:else if activeView === 'payment_setup'}
      <BillingPackagesWorkspace />
    {:else if loading && !operations}
      <section class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600" role="status">Loading financial operations…</section>
    {:else if errorMessage}
      <section class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
        <h2 class="font-semibold">Financial operations are unavailable</h2>
        <p class="mt-1">{errorMessage}</p>
        <button type="button" class="mt-3 crm-ui-button-secondary bg-white" on:click={loadOperations}>Retry</button>
      </section>
    {:else if operations}
      {#if activeTeam}
        <p class="mb-4 rounded-lg border border-[var(--crm-brand-border)] bg-[var(--crm-brand-surface)] p-4 text-sm text-[var(--crm-on-brand-surface)]">Financial operations are organization-wide so scheduled and overdue balances are not accidentally hidden by team filters.</p>
      {/if}
      {#if !operations.complete}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert"><strong>Some records are unavailable.</strong> Export will be available when all records load.</div>
      {/if}
      {#if !operations.reconciliation.complete}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">Reconciliation needs attention: {operations.reconciliation.unreconciledTransactionCount} transaction records and {operations.reconciliation.unreconciledDepositCount} deposits.</div>
      {/if}

      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-gray-600" aria-live="polite">
        <span>{filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}</span>
        <span>Visible total <strong class="ml-2 text-gray-950 tabular-nums">{rows.every((row) => row.currency === rows[0]?.currency) ? money(visibleTotal, rows[0]?.currency || 'USD') : 'Multiple currencies'}</strong></span>
      </div>
      <section class="rounded-xl border border-gray-200 bg-white text-gray-900" aria-label="Financial records">
        {#each filteredRows as row (rowKey(row))}
          <RecordItem title={row.label} context={row.context || ''} status={row.statusLabel} date={row.dateLabel || 'Date not recorded'} value={money(row.amountCents, row.currency)}>
            <dl>
              {#if row.detail}<dt>Details</dt><dd>{row.detail}</dd>{/if}
              <dt>Currency</dt><dd>{row.currency || 'Not recorded'}</dd>
            </dl>
          </RecordItem>
        {/each}
        {#if filteredRows.length === 0}<p class="p-6 text-center text-sm text-gray-600">{rows.length === 0 ? `No ${activeView} yet.` : 'No records match the current filters.'}</p>{/if}
      </section>
    {/if}
  </main>
</div>
