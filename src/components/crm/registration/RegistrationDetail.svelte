<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { DataStore, transactionsStore, invoicesStore, refundsStore, eventsStore } from '../../../lib/services/DataStore';
  import { downloadCsv } from '../../../lib/ui/csvExport';
  import {
    registrationSectionsFromForm,
    validateRegistrationSections,
  } from '../../../lib/registration/registrationFormBuilder';
  import RegistrationLifecycleReview from './RegistrationLifecycleReview.svelte';

  export let selectedForm: any = null;
  export let participants: any[] = [];
  export let connectedEvents: any[] = [];
  export let isLoadingParticipants = false;
  export let error = '';
  export let participantsTruncated = false;
  export let eventsTruncated = false;
  export let participantCount: number | null = null;
  export let eventCount: number | null = null;
  export let tenantId = '';

  const dispatch = createEventDispatcher();
  let lifecycleTarget: 'active' | 'archived' | null = null;
  let lifecycleReceipt = '';

  $: lifecycleStatus = String(selectedForm?.rawStatus || selectedForm?.status || '').toLowerCase();
  $: isRetired = lifecycleStatus === 'archived' || lifecycleStatus === 'closed';
  $: reactivationError = validateRegistrationSections(
    registrationSectionsFromForm(selectedForm),
  );

  function handleLifecycleSuccess(updated: any) {
    lifecycleReceipt = updated.rawStatus === 'archived'
      ? 'Registration form retired. Historical responses remain available.'
      : 'Registration form reactivated and available for event registration.';
    lifecycleTarget = null;
    dispatch('lifecycle', updated);
  }

  $: financialProjection = [
    $transactionsStore,
    $invoicesStore,
    $refundsStore,
    $eventsStore,
  ];

  function goBack() {
    dispatch('back');
  }

  function retryLoad() {
    dispatch('retry');
  }

  // A form can be linked to several events; form IDs are not event IDs.
  $: financials = (financialProjection, selectedForm
      ? DataStore.getRegistrationFormFinancials(selectedForm.id)
      : {
          totalCollected: 0,
          totalFees: 0,
          totalRefunds: 0,
          totalBalance: 0,
          totalsAvailable: false,
          currency: null,
          financialRecordCount: 0,
          scopeReason: 'No registration form selected.',
        });

  function formatMoney(minorUnits: unknown, currency: string) {
    const amount = Number(minorUnits);
    if (!Number.isSafeInteger(amount)) return 'Invalid amount';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
  }

  function formatScopedMoney(value: unknown) {
    if (financials.scopeReason === 'Financial projection is loading.') return 'Loading…';
    if (financials.financialRecordCount === 0) return 'No financial activity';
    if (!financials.totalsAvailable || !financials.currency) return 'Unavailable';
    return formatMoney(value, financials.currency);
  }

  function formatEventDate(value: any) {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Date unavailable';
  }

  function formatEventPrice(event: any) {
    const currency =
      typeof event.currency === 'string' && /^[A-Za-z]{3}$/.test(event.currency.trim())
        ? event.currency.trim().toUpperCase()
        : null;
    return currency ? formatMoney(event.priceCents, currency) : 'Currency unavailable';
  }

  function formatRegistrationDate(value: unknown) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Unavailable';
    return value.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }

  // Calculate participant statuses (enriching the participant list)
  $: connectedEventIds = new Set(connectedEvents.map((event) => event.id).filter(Boolean));
  $: enrichedParticipants = participants.map(p => {
    const userFinancials =
      eventsTruncated || !p.userId
        ? { paymentStatus: 'Unavailable' }
        : DataStore.getUserFinancialsForEvents(p.userId, connectedEventIds);
    return { ...p, financialStatus: userFinancials.paymentStatus };
  });

  // State for filtering, selection, and pagination
  let searchQuery = '';
  let selectedParticipants = new Set();

  let currentPage = 1;
  let itemsPerPage = 10;
  let previousSearchQuery = '';

  $: filteredParticipants = enrichedParticipants.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.participantName?.toLowerCase().includes(q)) ||
           (p.email?.toLowerCase().includes(q)) ||
           (p.id?.toLowerCase().includes(q));
  });

  $: if (searchQuery !== previousSearchQuery) {
    previousSearchQuery = searchQuery;
    selectedParticipants = new Set();
    currentPage = 1;
  }

  $: totalPages = Math.max(1, Math.ceil(filteredParticipants.length / itemsPerPage));

  $: {
    // Reset page if filtered items change and current page is out of bounds
    if (currentPage > totalPages) currentPage = 1;
  }

  $: paginatedParticipants = filteredParticipants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  $: pageParticipantIds = paginatedParticipants.map((participant) => participant.id).filter(Boolean);
  $: pageSelected =
    pageParticipantIds.length > 0
    && pageParticipantIds.every((id) => selectedParticipants.has(id));

  function toggleSelectAll() {
    const next = new Set(selectedParticipants);
    if (pageSelected) {
      pageParticipantIds.forEach((id) => next.delete(id));
    } else {
      pageParticipantIds.forEach((id) => next.add(id));
    }
    selectedParticipants = next;
  }

  function toggleSelect(id) {
    if (selectedParticipants.has(id)) {
      selectedParticipants.delete(id);
    } else {
      selectedParticipants.add(id);
    }
    selectedParticipants = selectedParticipants; // trigger reactivity
  }

  function handleClearAll() {
    searchQuery = '';
    selectedParticipants = new Set();
  }

  function handleExport() {
    const exportRows = selectedParticipants.size > 0
      ? filteredParticipants.filter((participant) => selectedParticipants.has(participant.id))
      : filteredParticipants;
    downloadCsv(
      exportRows.map((participant) => ({
        registrationId: participant.id,
        registrationStatus: participant.status || '',
        participant: participant.participantName || 'Unavailable',
        program: selectedForm.program || 'Unavailable',
        paymentStatus: participant.financialStatus || '',
        registeredAt: participant.date instanceof Date
          ? participant.date.toISOString()
          : 'Unavailable',
      })),
      [
        { key: 'registrationId', label: 'Registration ID' },
        { key: 'registrationStatus', label: 'Registration Status' },
        { key: 'participant', label: 'Participant' },
        { key: 'program', label: 'Program' },
        { key: 'paymentStatus', label: 'Payment Status' },
        { key: 'registeredAt', label: 'Registered At' },
      ],
      `${selectedForm.name || selectedForm.title || 'registration'}-participants`,
    );
  }

  function nextPage() {
    if (currentPage < totalPages) currentPage++;
  }

  function prevPage() {
    if (currentPage > 1) currentPage--;
  }

</script>

{#if lifecycleTarget}
  <RegistrationLifecycleReview
    {tenantId}
    form={selectedForm}
    {connectedEvents}
    targetStatus={lifecycleTarget}
    onCancel={() => lifecycleTarget = null}
    onSuccess={handleLifecycleSuccess}
  />
{/if}

<div class="flex justify-between items-start mb-1">
  <div class="flex items-center space-x-3">
    <button type="button" aria-label="Back to registration forms" on:click={goBack} class="text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
    </button>
    <h2 class="text-[28px] font-extrabold text-[var(--crm-brand-link)] leading-none tracking-tight">{selectedForm.name}</h2>
  </div>
  <div class="flex flex-wrap justify-end gap-2">
    <button type="button" on:click={() => dispatch('edit')} class="bg-[var(--crm-brand-surface)] text-[var(--crm-brand-link)] border border-[var(--crm-brand-border)] px-4 py-1.5 rounded text-sm font-semibold hover:bg-[var(--crm-brand-surface-strong)] flex items-center transition-colors">Edit Registration Form</button>
    {#if isRetired}
      <button type="button" class="crm-ui-button-primary" disabled={Boolean(reactivationError)} title={reactivationError ? `Cannot reactivate: ${reactivationError}` : undefined} on:click={() => lifecycleTarget = 'active'}>Reactivate form</button>
    {:else}
      <button type="button" class="crm-ui-button-secondary" on:click={() => lifecycleTarget = 'archived'}>Retire form</button>
    {/if}
  </div>
</div>

{#if lifecycleReceipt}<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{lifecycleReceipt}</p>{/if}

{#if error}
  <div class="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
    <p>{error}</p>
    <button
      type="button"
      on:click={retryLoad}
      disabled={isLoadingParticipants}
      class="crm-ui-detail-retry"
    >
      Retry loading detail
    </button>
  </div>
{/if}
{#if participantsTruncated || eventsTruncated}
  <div class="crm-ui-notice" role="status">
    {#if participantsTruncated}
      Showing {participants.length}{participantCount !== null ? ` of ${participantCount}` : ''} loaded participant{participants.length === 1 ? '' : 's'}.
    {/if}
    {#if eventsTruncated}
      Showing {connectedEvents.length}{eventCount !== null ? ` of ${eventCount}` : ''} connected event{connectedEvents.length === 1 ? '' : 's'}.
    {/if}
  </div>
{/if}

<!-- Metrics Cards -->
{#if !financials.totalsAvailable}
  <div class="crm-ui-notice" role="status">
    Financial totals are not shown as authoritative: {financials.scopeReason}
  </div>
{/if}
<div class="grid grid-cols-2 gap-4 mb-4">
  <!-- Participants Card -->
  <div class="border border-gray-200 rounded p-4 shadow-sm bg-white">
    <h3 class="text-base text-gray-600 mb-4">Participants</h3>
    <div class="grid grid-cols-4 gap-2 text-center items-stretch">
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Total</p>
        <p class="crm-ui-title whitespace-nowrap">{participantCount ?? participants.length}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Paid</p>
        <p class="crm-ui-title whitespace-nowrap">{participantsTruncated ? '—' : enrichedParticipants.filter(p => p.financialStatus === 'Paid').length}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Open Balance</p>
        <p class="crm-ui-title whitespace-nowrap">{participantsTruncated ? '—' : enrichedParticipants.filter(p => p.financialStatus === 'Open Balance').length}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Waitlisted</p>
        <p class="crm-ui-title whitespace-nowrap">{participantsTruncated ? '—' : enrichedParticipants.filter(p => p.status === 'Waitlisted').length}</p>
      </div>
    </div>
  </div>

  <!-- Payments Card -->
  <div class="border border-gray-200 rounded p-4 shadow-sm bg-white">
    <h3 class="text-base text-gray-600 mb-4">Payments</h3>
    <div class="grid grid-cols-4 gap-2 text-center items-stretch">
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Processing Fees</p>
        <p class="crm-ui-title whitespace-nowrap">{formatScopedMoney(financials.totalFees)}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Collected</p>
        <p class="crm-ui-title whitespace-nowrap">{formatScopedMoney(financials.totalCollected)}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Refunds</p>
        <p class="crm-ui-title whitespace-nowrap">{formatScopedMoney(financials.totalRefunds)}</p>
      </div>
      <div class="flex min-w-0 flex-col">
        <p class="crm-ui-meta flex min-h-10 items-end justify-center">Balance</p>
        <p class="crm-ui-title whitespace-nowrap">{formatScopedMoney(financials.totalBalance)}</p>
      </div>
    </div>
  </div>
</div>

<!-- Connected Events Table -->
<div class="mb-8">
  <h2 class="text-lg font-bold text-[var(--crm-brand-link)] mb-3">Connected Events</h2>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="border border-gray-200 rounded overflow-x-auto shadow-sm" role="region" tabindex="0" aria-label="Scrollable connected events table">
    <table class="crm-ui-table">
      <thead class="bg-white">
        <tr>
          <th scope="col" class="crm-ui-th-blue">Event Title</th>
          <th scope="col" class="crm-ui-th-blue">Type</th>
          <th scope="col" class="crm-ui-th-blue">Date</th>
          <th scope="col" class="crm-ui-th-blue">Price</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-100">
        {#if connectedEvents.length === 0}
          <tr>
            <td colspan="4" class="px-4 py-8 text-center text-gray-400 text-sm">
              <p>No events are currently using this registration form.</p>
            </td>
          </tr>
        {:else}
          {#each connectedEvents as evt (evt.id)}
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{evt.title}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{evt.type}</td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {formatEventDate(evt.date)}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {formatEventPrice(evt)}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<h2 class="text-lg font-bold text-[var(--crm-brand-link)] mb-3">Form Participants</h2>
<!-- Participant Table Toolbar -->
<div class="flex space-x-3 mb-2">
  <div class="relative flex-1">
    <div class="crm-ui-search-icon">
      <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
    </div>
    <label>
      <span class="sr-only">Search participants</span>
      <input
      type="search"
      bind:value={searchQuery}
      class="block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--crm-brand-border)] shadow-sm"
      placeholder="Search by participant name or email"
      />
    </label>
  </div>
  {#if searchQuery}
    <button type="button" on:click={handleClearAll} class="text-[var(--crm-brand-link)] text-xs hover:underline">Clear search</button>
  {/if}
  <button
    type="button"
    on:click={handleExport}
    disabled={filteredParticipants.length === 0}
    title={filteredParticipants.length === 0 ? 'There are no matching participants to export.' : undefined}
    class="bg-white text-[var(--crm-brand-link)] border border-gray-300 px-3 py-1.5 rounded text-sm font-semibold hover:bg-gray-50 flex items-center shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
  >
    <svg class="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
    Export
  </button>
</div>

<!-- Participants Table -->
<!-- Keyboard users must be able to focus and scroll this overflow region. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="border border-gray-200 rounded overflow-x-auto shadow-sm" role="region" tabindex="0" aria-label="Scrollable participants table">
  <table class="crm-ui-table">
    <thead class="bg-white">
      <tr>
        <th scope="col" class="px-4 py-3 text-left">
          <input type="checkbox" aria-label="Select all participants on this page" checked={pageSelected} disabled={isLoadingParticipants || pageParticipantIds.length === 0} on:change={toggleSelectAll} class="rounded border-gray-300 text-[var(--crm-brand-link)] focus:ring-[var(--crm-brand-focus)] disabled:cursor-not-allowed disabled:opacity-50">
        </th>
        <th scope="col" class="crm-ui-th-blue">Registration Status</th>
        <th scope="col" class="crm-ui-th-blue">Date &uarr;</th>
        <th scope="col" class="crm-ui-th-blue">Participant</th>
        <th scope="col" class="crm-ui-th-blue">Participant Group</th>
        <th scope="col" class="crm-ui-th-blue">Payment Status</th>
      </tr>
    </thead>
    <tbody class="bg-white divide-y divide-gray-100">
      {#if isLoadingParticipants}
        <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500 text-sm">Loading participants...</td></tr>
      {:else if paginatedParticipants.length === 0}
        <tr>
          <td colspan="6" class="px-4 py-16 text-center text-gray-400 text-sm">
            <p class="mb-4">No data found</p>
          </td>
        </tr>
      {:else}
        {#each paginatedParticipants as p (p.id)}
          <tr class="hover:bg-gray-50 {selectedParticipants.has(p.id) ? 'crm-theme-selected' : ''}">
            <td class="px-4 py-3 whitespace-nowrap">
              <input type="checkbox" aria-label={`Select ${p.participantName || p.id || 'unavailable participant'}`} checked={Boolean(p.id) && selectedParticipants.has(p.id)} disabled={!p.id} on:change={() => p.id && toggleSelect(p.id)} class="crm-ui-participant-checkbox">
            </td>
            <td class="crm-ui-td">{p.status || 'Unsupported status'}</td>
            <td class="crm-ui-td">{formatRegistrationDate(p.date)}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-[var(--crm-brand-link)]">{p.participantName || 'Participant name unavailable'}</td>
            <td class="crm-ui-td">{selectedForm.program || 'Unavailable'}</td>
            <td class="crm-ui-td">{p.financialStatus || 'Unavailable'}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>

  <!-- Footer Pagination -->
  <div class="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between">
    <div class="flex-1 flex justify-center">
      <nav class="relative z-0 inline-flex shadow-sm" aria-label="Pagination">
        <button type="button" on:click={prevPage} disabled={currentPage === 1} class="crm-ui-pager-button">
          Previous
        </button>
        <button type="button" on:click={nextPage} disabled={currentPage === totalPages} class="crm-ui-pager-button">
          Next
        </button>
      </nav>
    </div>
    <div>
      <p class="crm-ui-hint-xs">
        {Math.min(1 + (currentPage - 1) * itemsPerPage, filteredParticipants.length)} - {Math.min(currentPage * itemsPerPage, filteredParticipants.length)} of {filteredParticipants.length}
      </p>
    </div>
  </div>
</div>
