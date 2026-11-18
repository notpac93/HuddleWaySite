<script lang="ts">
  import { visibleFinancialTotal } from '../../lib/services/financialAmounts';
  import FinancialAdministration from './billing/FinancialAdministration.svelte';
  import FinancialInstallmentActions from './billing/FinancialInstallmentActions.svelte';
  import FinancialRecordActions from './billing/FinancialRecordActions.svelte';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
  import { onMount, tick } from 'svelte';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    type FinancialOperationRow,
    type FinancialOperations,
    type FinancialOperationView,
  } from '../../lib/api/BackendApi';
  import BillingPackagesWorkspace from './billing/BillingPackagesWorkspace.svelte';

  type WorkspaceView = FinancialOperationView | 'overview' | 'payment_setup';
  const views: Array<{ id: WorkspaceView; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'deposits', label: 'Deposits' },
    { id: 'payment_setup', label: 'Payment setup' },
  ];

  let activeView: WorkspaceView = 'overview';
  let setupSection: 'pricing' | 'providers' | 'operations' | 'plans' = 'pricing';
  let team = '';
  let teamMenuOpen = false;
  let teamOrder = 0;
  let selectedKey = '';
  let participantHistory = false;
  let ledger: Awaited<ReturnType<typeof backendClient.directInvoiceLedger>> | null = null;
  let ledgerError = false;
  let ledgerLoading = false;
  let ledgerGeneration = 0;
  let detailHeading: HTMLHeadingElement;

  $: teams = [...(operations?.teams || [])].sort((a, b) => a.name.localeCompare(b.name));
  $: teamNames = new Map(teams.map((item) => [item.id, item.name]));
  $: summary = operations?.summaries?.find((item) => item.teamId === team);
  $: recent = (operations?.views.transactions || []).filter((row) => !team || row.teamIds?.includes(team));
  $: selected = rows.find((row) => row.key === selectedKey) || null;
  $: history = selected
    ? recent.filter((row) => selected?.participantKey && row.participantKey === selected.participantKey)
    : [];
  $: ledgerLines = ledger ? [
    ...ledger.payments.map((entry) => ({ entry, label: 'Payment' })),
    ...ledger.refunds.map((entry) => ({ entry, label: 'Refund' })),
  ].sort((a, b) => String(b.entry.receivedAt || b.entry.createdAt || '').localeCompare(String(a.entry.receivedAt || a.entry.createdAt || ''))) : [];

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
  $: rows = activeView === 'overview' ? recent : activeView === 'payment_setup' ? [] : operations?.views[activeView] || [];
  $: statusOptions = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  $: filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    if ((team && !row.teamIds?.includes(team)) || (status && row.status !== status)) return false;
    if (!query) return true;
    return [row.label, row.context, row.statusLabel, row.detail, row.dateLabel, teamLabel(row, teamNames)]
      .some((value) => String(value || '').toLowerCase().includes(query));
  }).sort((a, b) => teamOrder * teamLabel(a, teamNames).localeCompare(teamLabel(b, teamNames)));
  $: visibleTotal = visibleFinancialTotal(filteredRows);
  $: if ($tenantIdStore && $tenantIdStore !== loadedTenantId && ownerAuthorized) {
    loadedTenantId = $tenantIdStore;
    team = '';
    clearSelection();
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
    clearSelection();
    search = '';
    status = '';
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('financeView', view);
      window.history.replaceState({}, '', url);
    }
  }

  function clearSelection() {
    selectedKey = '';
    participantHistory = false;
    ledger = null;
    ledgerError = false;
    ledgerLoading = false;
    ledgerGeneration++;
  }

  function teamLabel(row: FinancialOperationRow, names: Map<string, string>) {
    return (row.teamIds || []).map((id) => names.get(id)).filter(Boolean).join(', ') || 'Unassigned';
  }

  function scope(value: string) {
    team = value;
    teamMenuOpen = false;
    clearSelection();
  }

  async function openRecord(row: FinancialOperationRow) {
    const tenantId = $tenantIdStore;
    if (!tenantId || !ownerAuthorized) return;
    clearSelection();
    const generation = ledgerGeneration;
    selectedKey = row.key;
    await tick();
    if (generation !== ledgerGeneration || !ownerAuthorized || $tenantIdStore !== tenantId) return;
    detailHeading?.focus();
    if (!row.directInvoiceId) return;
    ledgerLoading = true;
    try {
      const result = await backendClient.directInvoiceLedger(tenantId, row.directInvoiceId);
      if (generation === ledgerGeneration) ledger = result;
    } catch {
      if (generation === ledgerGeneration) ledgerError = true;
    } finally {
      if (generation === ledgerGeneration) ledgerLoading = false;
    }
  }

  async function refreshRecord() {
    const row = selected;
    await loadOperations();
    if (row && selectedKey === row.key && row.directInvoiceId) await openRecord(row);
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
    const original = String(value ?? '');
    const text = typeof value !== 'number' && /^[\s]*[=+@-]/.test(original) ? "'" + original : original;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportVisibleRows() {
    if (!operations?.complete || activeView === 'overview' || activeView === 'payment_setup' || filteredRows.length === 0) return;
    const lines = [
      ['Date', 'Record', 'Context', 'Team', 'Status', 'Amount', 'Currency', 'Details'],
      ...filteredRows.map((row) => [
        row.dateLabel,
        row.label,
        row.context,
        teamLabel(row, teamNames),
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

  mountRefresh(() => registerLiveRefresh(() => loadOperations()));
</script>

<section class="h-full overflow-y-auto bg-white px-4 py-4 text-gray-900 sm:px-7">
  <div class="mx-auto max-w-6xl">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold tracking-tight">Financials</h1>
      {#if ownerAuthorized}<button type="button" class="crm-ui-button-secondary" on:click={() => setView('payment_setup')}>Payment setup</button>{/if}
    </header>
    <nav aria-label="Financial views" class="mt-3 flex flex-wrap gap-x-5 border-b border-gray-200">
      {#each views.filter((view) => view.id !== 'payment_setup') as view}
        <button type="button" aria-current={activeView === view.id ? 'page' : undefined}
          class:active-view={activeView === view.id} class="border-b-2 border-transparent py-3 text-sm font-semibold"
          on:click={() => setView(view.id)}>{view.label}</button>
      {/each}
    </nav>

    {#if !ownerAuthorized || !$tenantIdStore}
      <div class="mt-5" role="alert"><strong>Owner permission required</strong><p>Financial records are available only to organization owners.</p></div>
    {:else if activeView === 'payment_setup'}
      <div class="mt-4">
        <div class="mb-4 flex flex-wrap gap-2" aria-label="Payment setup views">
          {#each [{ id: 'pricing', label: 'Payment setup' }, { id: 'providers', label: 'Payment providers' }, { id: 'plans', label: 'Subscription plans' }, { id: 'operations', label: 'Operations' }] as option}
            <button type="button" class="crm-ui-button-secondary" aria-pressed={setupSection === option.id} on:click={() => setupSection = option.id as typeof setupSection}>{option.label}</button>
          {/each}
        </div>
        {#if setupSection === 'pricing'}<BillingPackagesWorkspace />
        {:else}
          {#key $tenantIdStore + setupSection}<FinancialAdministration tenantId={$tenantIdStore} section={setupSection} />{/key}
        {/if}
      </div>
    {:else if loading && !operations}
      <p class="mt-5" role="status">Loading financial activity…</p>
    {:else if errorMessage && !operations}
      <div class="mt-5" role="alert">{errorMessage} <button class="crm-ui-button-secondary" type="button" on:click={loadOperations}>Retry</button></div>
    {:else if operations}
      {#if errorMessage}<p class="mt-3 text-red-800" role="alert">{errorMessage}</p>{/if}
      {#if !operations.complete}<p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="status">Some records are unavailable. Export and totals require a complete result.</p>{/if}
      {#if !operations.reconciliation.complete}<p class="mt-3 text-sm text-amber-900" role="status">Some payments or deposits need reconciliation.</p>{/if}
      {#if selected}
        <article class="mt-4 max-w-3xl">
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" class="py-2 font-semibold text-[var(--crm-brand-link)]" on:click={() => participantHistory ? (participantHistory = false) : clearSelection()}>
              ← Back to {participantHistory ? 'record' : views.find((view) => view.id === activeView)?.label}
            </button>
            <span class="border-l pl-3 text-gray-600">{participantHistory ? 'Participant financials' : humanStatus(selected.kind)}</span>
          </div>
          <h2 class="text-3xl font-bold tracking-tight" tabindex="-1" bind:this={detailHeading}>{selected.label}</h2>
          {#if !participantHistory}<p class="mt-2 flex flex-wrap items-center gap-3"><strong class="text-2xl tabular-nums">{money(selected.amountCents, selected.currency)}</strong><span class="finance-status" data-status={selected.status}>{selected.statusLabel}</span></p>{/if}
          <dl class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div><dt class="text-sm text-gray-600">Team</dt><dd>{teamLabel(selected, teamNames)}</dd></div>
            {#if !participantHistory && selected.context}<div><dt class="text-sm text-gray-600">{selected.kind === 'deposit' ? 'Account' : 'For'}</dt><dd>{selected.context}</dd></div>{/if}
            {#if !participantHistory && selected.date}<div><dt class="text-sm text-gray-600">{['invoice','scheduled_payment','overdue'].includes(selected.kind) ? 'Due or last updated' : 'Date'}</dt><dd>{selected.dateLabel}</dd></div>{/if}
          </dl>
          {#if !participantHistory}
            <div class="mt-3 flex flex-wrap items-center gap-3">
              {#key selected.key}<FinancialRecordActions tenantId={$tenantIdStore} row={selected} onSaved={refreshRecord} />{/key}
              {#if selected.participantId && selected.agreementId}<FinancialInstallmentActions tenantId={$tenantIdStore} participantId={selected.participantId} agreementId={selected.agreementId} onSaved={refreshRecord} />{/if}
              {#if selected.participantKey}<button type="button" class="py-2 text-sm font-semibold text-[var(--crm-brand-link)]" on:click={() => participantHistory = true}>View participant payment history →</button>{/if}
            </div>
          {/if}
          {#if !participantHistory && selected.detail}<p class="mt-2 text-sm text-gray-600">{selected.detail}</p>{/if}
          <h3 class="mb-2 mt-5 text-lg font-semibold">{selected.kind === 'deposit' ? 'Deposit timeline' : 'Payment timeline'}</h3>
          {#if !participantHistory && selected.directInvoiceId}
            {#if ledgerLoading}<p role="status">Loading invoice ledger…</p>
            {:else if ledgerError}<p role="alert">The invoice ledger could not be loaded. <button type="button" on:click={() => selected && openRecord(selected)}>Retry</button></p>
            {:else if ledgerLines.length}
              <ol class="divide-y border-y">
                {#each ledgerLines as { entry, label }}
                  <li class="flex flex-wrap justify-between gap-3 py-3"><div><strong>{label} · {humanStatus(String(entry.status || 'recorded'))}</strong><p class="text-sm text-gray-600">{String(entry.receivedAt || entry.createdAt || '').slice(0, 10)}</p></div><strong>{money(typeof entry.amountCents === 'number' ? entry.amountCents : null, typeof entry.currency === 'string' ? entry.currency.toUpperCase() : selected.currency)}</strong></li>
                {/each}
              </ol>
            {:else}<p>No payments or refunds were recorded for this invoice.</p>{/if}
          {:else}
            {@const entries = participantHistory ? history : selected.kind === 'invoice' || selected.kind === 'scheduled_payment' || selected.kind === 'overdue' ? [] : [selected]}
            {#if entries.length}
              <ol class="divide-y border-y">
                {#each entries as entry (entry.key)}
                  <li class="flex flex-wrap justify-between gap-3 py-3">
                    <div><strong>{entry.kind === 'refund' ? 'Refund · ' : ''}{entry.statusLabel}</strong><p class="text-sm text-gray-600">{[entry.context, entry.dateLabel].filter(Boolean).join(' · ')}</p></div>
                    <strong class="tabular-nums">{money(entry.amountCents, entry.currency)}</strong>
                  </li>
                {/each}
              </ol>
            {:else}<p class="text-sm text-gray-600">No linked payment activity available.</p>{/if}
          {/if}
        </article>
      {:else}
        <div class="my-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-3xl font-bold tracking-tight">{views.find((view) => view.id === activeView)?.label}</h2>
          {#if teams.length === 1}
            <button class="crm-ui-button-secondary" type="button" aria-pressed={team === teams[0].id} on:click={() => scope(team ? '' : teams[0].id)}>{teams[0].name}</button>
          {:else if teams.length > 1}
            <details class="team-picker relative" bind:open={teamMenuOpen}>
              <summary class="crm-ui-button-secondary cursor-pointer">{teamNames.get(team) || 'All teams'} ▾</summary>
              <div id="financial-team-picker" class="absolute right-0 z-10 rounded-lg border bg-white p-1 shadow-lg">
                {#each [{ id: '', name: 'All teams' }, ...teams] as option (option.id)}
                  <button type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-100" aria-pressed={team === option.id}
                    on:click={() => scope(option.id)}>{option.name}</button>
                {/each}
              </div>
            </details>
          {/if}
        </div>
        {#if activeView === 'overview'}
          <div class="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,1.65fr)]">
            <section class="rounded-lg border border-gray-200 p-4">
              <div class="flex flex-wrap justify-between gap-2"><h3 class="font-semibold">Payment summary</h3><span class="text-sm text-gray-600">Month to date</span></div>
              <dl class="my-4 grid grid-cols-2 gap-4 text-sm">
                {#each [
                  ['Gross income', operations.complete && summary && summary.grossAvailable !== false ? summary.grossIncome.map((value) => money(value.amountCents, value.currency)).join(' · ') || 'No payments' : '—'],
                  ['Successful payments', operations.complete ? summary?.successfulPayments ?? '—' : '—'],
                  ['Customers', operations.complete ? summary?.customers ?? '—' : '—'],
                  ['All payments', operations.complete ? summary?.allPayments ?? '—' : '—'],
                ] as [label, value]}
                  <div><dt class="text-gray-600">{label}</dt><dd class="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
                {/each}
              </dl>
              <h3 class="border-t border-gray-200 pt-3 font-semibold">Top registration events</h3>
              {#if operations.complete && summary?.topEvents.length}
                <ol class="mt-2 divide-y">{#each summary.topEvents as event}<li class="flex justify-between gap-2 py-2 text-sm"><span>{event.name}</span><strong>{event.count}</strong></li>{/each}</ol>
              {:else}<p class="mt-2 text-sm text-gray-600">No registration totals available.</p>{/if}
            </section>
            <section class="rounded-lg border border-gray-200">
              <div class="flex justify-between gap-2 border-b border-gray-200 p-4"><h3 class="font-semibold">Recent transactions</h3><button type="button" class="text-sm font-semibold text-[var(--crm-brand-link)]" on:click={() => setView('transactions')}>View all →</button></div>
              {#each recent.slice(0, 5) as row (row.key)}
                <button type="button" class="flex w-full justify-between gap-3 border-b border-gray-100 p-3 text-left last:border-0 hover:bg-gray-50" on:click={() => openRecord(row)}>
                  <span><strong>{row.label}</strong><span class="block text-sm text-gray-600">{[row.context, teamLabel(row, teamNames), row.dateLabel].filter(Boolean).join(' · ')}</span></span>
                  <span class="text-right"><strong class="block tabular-nums">{money(row.amountCents, row.currency)}</strong><span class="finance-status" data-status={row.status}>{row.statusLabel}</span></span>
                </button>
              {:else}<p class="p-4 text-sm text-gray-600">No transactions yet.</p>{/each}
            </section>
          </div>
        {:else}
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <label class="sr-only" for="finance-search">Search records</label>
            <input id="finance-search" class="crm-ui-input" type="search" bind:value={search} placeholder="Search records" />
            {#if statusOptions.length > 1}
              <select aria-label="Status" class="crm-ui-input" bind:value={status}><option value="">All statuses</option>{#each statusOptions as option}<option value={option}>{humanStatus(option)}</option>{/each}</select>
            {/if}
            <select aria-label="Sort by team" class="crm-ui-input md:hidden" bind:value={teamOrder}><option value={0}>Sort by team</option><option value={1}>Team A–Z</option><option value={-1}>Team Z–A</option></select>
            <button type="button" class="crm-ui-button-secondary" disabled={!operations.complete || !filteredRows.length} on:click={exportVisibleRows}>Export</button>
            {#if activeView === 'invoices'}<FinancialRecordActions tenantId={$tenantIdStore} onSaved={loadOperations} />{/if}
          </div>
          {#if filteredRows.length}
            <table class="hidden w-full border-collapse text-sm md:table">
              <thead class="bg-gray-50"><tr>
                <th class="px-3 py-2 text-left" scope="col">{activeView === 'deposits' ? 'Deposit account' : 'Participant / record'}</th>
                <th class="px-3 py-2 text-left" scope="col" aria-sort={teamOrder === 1 ? 'ascending' : teamOrder === -1 ? 'descending' : 'none'}><button type="button" on:click={() => teamOrder = teamOrder === 1 ? -1 : teamOrder === -1 ? 0 : 1}>Team {teamOrder === 1 ? '↑' : teamOrder === -1 ? '↓' : '↕'}</button></th>
                <th class="px-3 py-2 text-left" scope="col">Status</th><th class="px-3 py-2 text-left" scope="col">Date</th><th class="px-3 py-2 text-right" scope="col">{activeView === 'deposits' ? 'Deposit total' : 'Amount'}</th>
              </tr></thead>
              <tbody>{#each filteredRows as row (row.key)}<tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="p-3"><button type="button" class="text-left font-semibold text-[var(--crm-brand-link)]" on:click={() => openRecord(row)}>{row.label}</button>{#if row.context}<p class="text-xs text-gray-600">{row.context}</p>{/if}</td>
                <td class="p-3">{teamLabel(row, teamNames)}</td><td class="p-3"><span class="finance-status" data-status={row.status}>{row.statusLabel}</span></td><td class="p-3 text-gray-600">{row.dateLabel}</td><td class="p-3 text-right font-semibold tabular-nums">{money(row.amountCents, row.currency)}</td>
              </tr>{/each}</tbody>
            </table>
            <div class="divide-y border-y border-gray-200 md:hidden">{#each filteredRows as row (row.key)}
              <button type="button" class="flex w-full justify-between gap-3 py-3 text-left" on:click={() => openRecord(row)}>
                <span class="min-w-0"><strong>{row.label}</strong><span class="block text-sm text-gray-600">{[row.context, teamLabel(row, teamNames), row.dateLabel].filter(Boolean).join(' · ')}</span></span>
                <span class="text-right"><strong class="block tabular-nums">{money(row.amountCents, row.currency)}</strong><span class="finance-status" data-status={row.status}>{row.statusLabel}</span></span>
              </button>
            {/each}</div>
            <footer class="mt-3 flex flex-wrap justify-between gap-2 text-sm text-gray-600" aria-live="polite">
              <span>{filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}</span>
              {#if activeView === 'deposits' && team}<span>Amounts show the full bank transfer.</span>{/if}
              {#if ['deposits', 'scheduled', 'overdue'].includes(activeView)}
                <span>Visible total <strong>{visibleTotal.mixedCurrency ? 'Multiple currencies' : money(operations.complete ? visibleTotal.amount : null, visibleTotal.currency)}</strong></span>
              {/if}
            </footer>
          {:else}<p class="border-y py-5 text-sm text-gray-600">No records match this view.</p>{/if}
        {/if}
      {/if}
    {/if}
  </div>
</section>

<style>
  .active-view { border-color: var(--crm-brand-secondary); color: var(--crm-brand-link); }
  .team-picker { margin-left: auto; }
  .finance-status { border-radius: .3rem; background: var(--crm-brand-surface); color: var(--crm-brand-link); padding: .14rem .4rem; font-size: .75rem; font-weight: 600; }
  #financial-team-picker { margin-top: .35rem; min-width: 11rem; max-height: 50vh; overflow: auto; }
  .finance-status:is([data-status=succeeded],[data-status=paid],[data-status=reconciled]) { background: #ecfdf5; color: #065f46; }
  .finance-status:is([data-status=failed],[data-status=past_due],[data-status=disputed]) { background: #fef2f2; color: #991b1b; }
  .team-picker[open] #financial-team-picker { animation: finance-menu-in 150ms ease-out; }
  @keyframes finance-menu-in { from { opacity: 0; transform: translateY(-.25rem); } }
  @media (prefers-reduced-motion: reduce) { .team-picker[open] #financial-team-picker { animation: none; } }
</style>
