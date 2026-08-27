<script lang="ts">
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
  let requestId = '';
  let search = '';
  let status = '';
  let loadedTenantId = '';

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
    if (!tenantId || !ownerAuthorized) return;
    loading = true;
    errorMessage = '';
    requestId = '';
    try {
      const overview = await backendClient.financialOverview(tenantId);
      if ($tenantIdStore !== tenantId) return;
      operations = overview.operations;
    } catch (error) {
      operations = null;
      errorMessage = 'Financial operations could not be loaded. Retry or contact support.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    } finally {
      if ($tenantIdStore === tenantId) loading = false;
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
</script>

<div class="flex h-full min-h-0 flex-col bg-gray-50">
  <header class="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 class="crm-ui-page-title">Financial operations</h1>
        <p class="mt-1 text-sm text-gray-600">Review what was collected, what is scheduled, and what needs attention.</p>
      </div>
      <button type="button" class="crm-ui-button-secondary bg-white" disabled={loading || !ownerAuthorized} on:click={loadOperations}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <nav class="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Financial operation views">
      {#each views as view}
        <button type="button" aria-pressed={activeView === view.id} class="whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold {activeView === view.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}" on:click={() => setView(view.id)}>{view.label}</button>
      {/each}
    </nav>
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
        {#if requestId}<p class="mt-1 text-xs">Support request: {requestId}</p>{/if}
        <button type="button" class="mt-3 crm-ui-button-secondary bg-white" on:click={loadOperations}>Retry</button>
      </section>
    {:else if operations}
      {#if activeTeam}
        <p class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Financial operations are organization-wide so scheduled and overdue balances are not accidentally hidden by team filters.</p>
      {/if}
      {#if !operations.complete}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert"><strong>Complete refresh required.</strong> Some sources did not finish loading, so export is disabled.</div>
      {/if}
      {#if !operations.reconciliation.complete}
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">Reconciliation needs attention: {operations.reconciliation.unreconciledTransactionCount} transaction records and {operations.reconciliation.unreconciledDepositCount} deposits.</div>
      {/if}

      <section class="rounded-xl border border-gray-200 bg-white shadow-sm">
        <header class="grid gap-4 border-b border-gray-200 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label><span class="crm-ui-label-xs">Search</span><input class="crm-ui-input mt-1 bg-white" type="search" bind:value={search} placeholder="Participant, offering, or status" /></label>
          <label><span class="crm-ui-label-xs">Status</span><select class="crm-ui-input mt-1 bg-white" bind:value={status}><option value="">All statuses</option>{#each statusOptions as option}<option value={option}>{humanStatus(option)}</option>{/each}</select></label>
          <button type="button" class="crm-ui-button-secondary bg-white" disabled={!operations.complete || filteredRows.length === 0} title={!operations.complete ? 'Refresh until the server confirms a complete snapshot.' : undefined} on:click={exportVisibleRows}>Export this view</button>
        </header>
        <div class="grid grid-cols-2 gap-px bg-gray-200 sm:grid-cols-3">
          <div class="bg-white p-4"><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Records</p><p class="mt-1 text-2xl font-bold text-gray-950">{filteredRows.length}</p></div>
          <div class="bg-white p-4 sm:col-span-2"><p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Visible total</p><p class="mt-1 text-2xl font-bold text-gray-950">{rows.every((row) => row.currency === rows[0]?.currency) ? money(visibleTotal, rows[0]?.currency || 'USD') : 'Multiple currencies'}</p></div>
        </div>
        <div class="overflow-x-auto" role="region" aria-label={`${activeView} financial records`}>
          <table class="crm-ui-table">
            <thead><tr><th class="crm-ui-th">Date</th><th class="crm-ui-th">Record</th><th class="crm-ui-th">Context</th><th class="crm-ui-th">Status</th><th class="crm-ui-th text-right">Amount</th></tr></thead>
            <tbody class="divide-y divide-gray-100">
              {#each filteredRows as row (rowKey(row))}
                <tr>
                  <td data-label="Date" class="px-4 py-3 text-sm text-gray-700">{row.dateLabel || 'Not recorded'}</td>
                  <td data-label="Record" class="px-4 py-3"><span class="text-sm font-semibold text-gray-950">{row.label}</span>{#if row.detail}<span class="block text-xs text-gray-500">{row.detail}</span>{/if}</td>
                  <td data-label="Context" class="px-4 py-3 text-sm text-gray-700">{row.context || '—'}</td>
                  <td data-label="Status" class="px-4 py-3 text-sm"><span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">{row.statusLabel}</span></td>
                  <td data-label="Amount" class="px-4 py-3 text-right text-sm font-semibold text-gray-950">{money(row.amountCents, row.currency)}</td>
                </tr>
              {/each}
              {#if filteredRows.length === 0}<tr><td colspan="5" class="px-6 py-10 text-center text-sm text-gray-600">{rows.length === 0 ? `No ${activeView} records are available.` : 'No records match the current filters.'}</td></tr>{/if}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  @media (max-width: 639px) {
    table, thead, tbody, th, td, tr { display: block; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    tbody tr { border-bottom: 1px solid rgb(229 231 235); padding: 0.5rem 0; }
    tbody td { display: flex; align-items: start; justify-content: space-between; gap: 1rem; text-align: right; }
    tbody td[data-label]::before { content: attr(data-label); flex: none; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: rgb(107 114 128); }
  }
</style>
