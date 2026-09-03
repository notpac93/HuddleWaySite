<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
  } from '../../../lib/api/BackendApi';
  import {
    DataStore,
    eventsProjectionScope,
    eventsStore,
    financialProjectionScope,
    seasonRegistrationsProjectionScope,
    seasonRegistrationsStore,
    registrationNamesMap,
    teamsStore,
    usersMap,
  } from '../../../lib/services/DataStore';
  import LinkEventModal from './LinkEventModal.svelte';
  import EditSeasonModal from './EditSeasonModal.svelte';
  import CreateEventForm from '../events/CreateEventForm.svelte';
  import { downloadCsv } from '../../../lib/ui/csvExport';
  import { formatDateOnly } from '../../../lib/ui/dateOnly';

  export let season: any = null;
  export let onNavigateTab: (tab: string, id?: string | null) => void = () => {};

  const dispatch = createEventDispatcher();

  let showLinkEventModal = false;
  let showCreateEventModal = false;
  let showEditSeasonModal = false;
  let participantSearch = '';

  let activeTab = 'participants'; // 'participants' | 'events'
  $: seasonId = String(season?.id || '').trim();
  $: seasonTeamName = String(
    $teamsStore.find((team) => String(team?.id || '') === String(season?.teamId || ''))?.name
    || '',
  ).trim();
  let unlinkCandidate: any = null;
  let unlinkReason = '';
  let unlinkConfirmation = '';
  let unlinkState: 'idle' | 'loading' | 'error' = 'idle';
  let unlinkError = '';
  let unlinkRequestId = '';
  let unlinkKey = createIdempotencyKey('event-season-unlink');
  let unlinkSignature = '';
  let unlinkGeneration = 0;
  let eventSeasonOverrides: Record<string, string | null> = {};
  let eventMutationReceipt = '';
  const unlinkText = 'UNLINK EVENT';

  function goBack() {
    dispatch('back');
  }

  // Calculate financials for this specific season
  $: financials = seasonId
    ? DataStore.getSeasonFinancials(seasonId)
    : {
        totalCollected: 0,
        totalFees: 0,
        totalRefunds: 0,
        totalBalance: 0,
        participants: 0,
        totalsAvailable: false,
        currency: null,
        financialRecordCount: 0,
        scopeReason: 'No season selected.',
      };
  $: participantProjectionUnavailable =
    $seasonRegistrationsProjectionScope.loading
    || Boolean($seasonRegistrationsProjectionScope.error)
    || $seasonRegistrationsProjectionScope.truncated;
  $: eventProjectionUnavailable =
    $eventsProjectionScope.loading
    || Boolean($eventsProjectionScope.error)
    || $eventsProjectionScope.truncated;
  $: participantFinanceUnavailable =
    participantProjectionUnavailable
    || eventProjectionUnavailable
    || $financialProjectionScope.loading
    || Boolean($financialProjectionScope.error)
    || $financialProjectionScope.truncated.transactions
    || $financialProjectionScope.truncated.invoices;
  $: participantExportUnavailable =
    participantFinanceUnavailable;

  function formatMoney(minorUnits: unknown, currency: string) {
    const amount = Number(minorUnits);
    if (!Number.isSafeInteger(amount)) return 'Invalid amount';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  }

  function formatScopedMoney(value: unknown) {
    if (!financials.totalsAvailable) return 'Unavailable';
    if (financials.financialRecordCount === 0) return 'No records';
    if (!financials.currency) return 'Unavailable';
    return formatMoney(value, financials.currency);
  }

  // Find participants for this season
  $: normalizedSeasonRegistrations = $seasonRegistrationsStore.map(
    (registration) => ({
      ...registration,
      id: String(registration?.id || '').trim(),
      userId: String(registration?.userId || '').trim(),
    }),
  );
  $: malformedRegistrationCount = normalizedSeasonRegistrations.filter(
    (registration) => !registration.id,
  ).length;
  $: participants = normalizedSeasonRegistrations
    .filter((registration) =>
      registration.id && registration.seasonId === seasonId
    )
    .map(r => {
      const uFin = DataStore.getUserFinancialsForSeason(
        r.userId,
        seasonId,
      );
      return {
        id: r.id,
        registrationId: String(r.registrationId || '').trim() || r.id,
        userId: r.userId,
        name: String(
          r.participantName
          || $registrationNamesMap[String(r.registrationId || '').trim()]
          || $usersMap[r.userId]
          || 'Participant name unavailable'
        ),
        date: r.createdAt
          ? new Date(r.createdAt.toMillis ? r.createdAt.toMillis() : r.createdAt)
          : null,
        status:
          typeof r.status === 'string' && r.status.trim()
            ? r.status.trim()
            : 'Status unavailable',
        financialStatus: uFin.paymentStatus,
        program: season?.name || season?.title || 'Season name unavailable'
      };
    });
  $: filteredParticipants = participants.filter((participant) => {
    if (!participantSearch.trim()) return true;
    return participant.name.toLowerCase().includes(participantSearch.trim().toLowerCase());
  });

  // Events for this season
  $: normalizedEvents = $eventsStore.map((event) => ({
    ...event,
    id: String(event?.id || '').trim(),
    title: String(event?.title || 'Event title unavailable'),
    seasonId: Object.prototype.hasOwnProperty.call(
      eventSeasonOverrides,
      String(event?.id || '').trim(),
    )
      ? eventSeasonOverrides[String(event?.id || '').trim()]
      : event?.seasonId,
  }));
  $: malformedEventCount =
    normalizedEvents.filter((event) => !event.id).length;
  $: seasonEvents = normalizedEvents.filter(
    (event) => event.id && event.seasonId === seasonId,
  ).sort((a, b) => {
    const dateA = a.date ? (a.date.toDate ? a.date.toDate() : new Date(a.date)) : new Date(0);
    const dateB = b.date ? (b.date.toDate ? b.date.toDate() : new Date(b.date)) : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  function handleCreateNewEvent() {
    showLinkEventModal = false;
    showCreateEventModal = true;
  }

  function handleEventLinked(event: CustomEvent<{ eventId: string; seasonId: string }>) {
    const eventId = String(event.detail?.eventId || '').trim();
    if (!eventId) return;
    eventSeasonOverrides = { ...eventSeasonOverrides, [eventId]: seasonId };
    eventMutationReceipt = 'Event linked to this season.';
  }

  function exportParticipants() {
    downloadCsv(
      filteredParticipants.map((participant) => ({
        registrationId: participant.id,
        registrationStatus: participant.status,
        participant: participant.name,
        registeredAt: participant.date || '',
        paymentStatus: participant.financialStatus,
      })),
      [
        { key: 'registrationId', label: 'Registration ID' },
        { key: 'registrationStatus', label: 'Registration Status' },
        { key: 'participant', label: 'Participant' },
        { key: 'registeredAt', label: 'Registered At' },
        { key: 'paymentStatus', label: 'Payment Status' },
      ],
      `${season?.name || season?.title || 'season'}-participants`,
    );
  }

  function beginUnlink(event: any) {
    if (unlinkState === 'loading') return;
    unlinkCandidate = event;
    unlinkReason = '';
    unlinkConfirmation = '';
    unlinkState = 'idle';
    unlinkError = '';
    unlinkRequestId = '';
  }

  function cancelUnlink() {
    if (unlinkState === 'loading') return;
    unlinkCandidate = null;
    unlinkState = 'idle';
  }

  $: {
    const signature = JSON.stringify({
      tenantId: $tenantIdStore,
      eventId: unlinkCandidate?.id || '',
      reason: unlinkReason.trim(),
    });
    if (signature !== unlinkSignature && unlinkState !== 'loading') {
      unlinkSignature = signature;
      unlinkKey = createIdempotencyKey('event-season-unlink');
      unlinkError = '';
      unlinkRequestId = '';
      if (unlinkState === 'error') unlinkState = 'idle';
    }
  }

  async function unlinkEvent() {
    const tenantId = $tenantIdStore;
    const eventId = String(unlinkCandidate?.id || '').trim();
    const reason = unlinkReason.trim();
    if (
      !tenantId
      || !eventId
      || reason.length < 3
      || unlinkConfirmation !== unlinkText
      || unlinkState === 'loading'
    ) return;
    const generation = ++unlinkGeneration;
    const signature = JSON.stringify({ tenantId, eventId, reason });
    if (signature !== unlinkSignature) {
      unlinkSignature = signature;
      unlinkKey = createIdempotencyKey('event-season-unlink');
    }
    const key = unlinkKey;
    unlinkState = 'loading';
    unlinkError = '';
    try {
      await backendClient.updateEvent(
        tenantId,
        eventId,
        { seasonId: null },
        reason,
        key,
      );
      if (
        generation !== unlinkGeneration
        || $tenantIdStore !== tenantId
        || unlinkSignature !== signature
      ) return;
      unlinkCandidate = null;
      eventSeasonOverrides = { ...eventSeasonOverrides, [eventId]: null };
      eventMutationReceipt = 'Event unlinked from this season.';
      unlinkState = 'idle';
    } catch (error) {
      if (
        generation !== unlinkGeneration
        || $tenantIdStore !== tenantId
        || unlinkSignature !== signature
      ) return;
      unlinkRequestId =
        error instanceof BackendApiError ? error.requestId || '' : '';
      console.error('Event-to-season unlink failed.', {
        requestId: unlinkRequestId || 'unavailable',
      });
      unlinkError = 'The event could not be unlinked.';
      unlinkState = 'error';
    }
  }

  onDestroy(() => {
    unlinkGeneration += 1;
  });

</script>

{#if showLinkEventModal && seasonId}
  <LinkEventModal {season} on:close={() => showLinkEventModal = false} on:createNew={handleCreateNewEvent} on:linked={handleEventLinked} />
{/if}

{#if showCreateEventModal && seasonId}
  <CreateEventForm
    {seasonId}
    on:success={() => showCreateEventModal = false}
    on:cancel={() => showCreateEventModal = false}
  />
{/if}

{#if showEditSeasonModal && seasonId}
  <EditSeasonModal
    {season}
    on:close={() => showEditSeasonModal = false}
    on:success={() => showEditSeasonModal = false}
  />
{/if}

<div class="flex justify-between items-start mb-1">
  <div class="flex items-center space-x-3">
    <button type="button" aria-label="Back to seasons" on:click={goBack} class="text-gray-400 hover:text-gray-600 transition-colors bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
    </button>
    <h2 class="text-[28px] font-extrabold text-[var(--crm-brand-link)] leading-none tracking-tight">{season?.name || season?.title || 'Unnamed Season'}</h2>
  </div>
  <button type="button" disabled={!seasonId} on:click={() => showEditSeasonModal = true} class="bg-[var(--crm-brand-surface)] text-[var(--crm-brand-link)] border border-[var(--crm-brand-border)] px-4 py-1.5 rounded text-sm font-semibold hover:bg-[var(--crm-brand-surface-strong)] flex items-center transition-colors disabled:opacity-50">
    <svg class="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
    Edit
  </button>
</div>

<!-- Status badges under title -->
<div class="flex items-center space-x-3 mb-6 mt-2 ml-10">
  <span class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-3 py-1 rounded text-sm font-semibold">{season?.status || 'Unsupported status'}</span>
  <span class="crm-ui-hint-xs">Payment options are managed on the linked registration form.</span>
</div>

<dl class="mb-6 ml-10 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-3">
  <div><dt class="text-gray-500">Dates</dt><dd class="font-medium text-gray-900">{formatDateOnly(season?.startDate)} – {formatDateOnly(season?.endDate)}</dd></div>
  <div><dt class="text-gray-500">Registration form</dt><dd class="font-medium text-gray-900">{season?.registrationFormId || 'Not attached'}</dd></div>
  <div><dt class="text-gray-500">Scope</dt><dd class="font-medium text-gray-900">{season?.teamId ? `Team · ${seasonTeamName || 'Team name unavailable'}` : 'Organization-wide'}</dd></div>
</dl>

{#if !seasonId}
  <div class="crm-ui-danger mb-4" role="alert">
    This season record is missing its identifier. Editing, event linking, and exports are unavailable.
  </div>
{/if}

<!-- Metrics Cards -->
<div class="grid grid-cols-2 gap-4 mb-4">
  <!-- Participants Card -->
  <button type="button" class="border border-gray-200 rounded p-4 text-left shadow-sm bg-white" on:click={() => { activeTab = 'participants'; participantSearch = ''; }}>
    <h3 class="text-base text-gray-600 mb-4">Participants</h3>
    <div class="grid grid-cols-4 gap-2 text-center">
      <div>
        <p class="crm-ui-meta">Total</p>
        <p class="crm-ui-title">
          {participantProjectionUnavailable ? '—' : participants.length}
        </p>
      </div>
      <div>
        <p class="crm-ui-meta">Paid</p>
        <p class="crm-ui-title">{participantFinanceUnavailable ? '—' : participants.filter(p => p.financialStatus === 'Paid').length}</p>
      </div>
      <div>
        <p class="crm-ui-meta">Open Balance</p>
        <p class="crm-ui-title">{participantFinanceUnavailable ? '—' : participants.filter(p => p.financialStatus === 'Open Balance').length}</p>
      </div>
      <div>
        <p class="crm-ui-meta">Waitlisted</p>
        <p class="crm-ui-title">{participantProjectionUnavailable ? '—' : participants.filter(p => String(p.status).toLowerCase() === 'waitlisted').length}</p>
      </div>
    </div>
  </button>

  <!-- Payments Card -->
  <button type="button" class="border border-gray-200 rounded p-4 text-left shadow-sm bg-white" on:click={() => onNavigateTab('Financials')}>
    <h3 class="text-base text-gray-600 mb-4">Payments</h3>
    <div class="grid grid-cols-4 gap-2 text-center">
      <div>
        <p class="crm-ui-meta">Total Fees</p>
        <p class="crm-ui-title">{formatScopedMoney(financials.totalFees)}</p>
      </div>
      <div>
        <p class="crm-ui-meta">Collected</p>
        <p class="crm-ui-title">{formatScopedMoney(financials.totalCollected)}</p>
      </div>
      <div>
        <p class="crm-ui-meta">Refunds</p>
        <p class="crm-ui-title">{formatScopedMoney(financials.totalRefunds)}</p>
      </div>
      <div>
        <p class="crm-ui-meta">Balance</p>
        <p class="crm-ui-title">{formatScopedMoney(financials.totalBalance)}</p>
      </div>
    </div>
  </button>
</div>

<!-- Tabs -->
<div class="border-b border-gray-200 mb-6">
  <nav class="-mb-px flex space-x-8" aria-label="Season detail">
    <button
      type="button"
      aria-pressed={activeTab === 'participants'}
      class="{activeTab === 'participants' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors"
      on:click={() => activeTab = 'participants'}
    >
      Participants
    </button>
    <button
      type="button"
      aria-pressed={activeTab === 'events'}
      class="{activeTab === 'events' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors"
      on:click={() => activeTab = 'events'}
    >
      Events <span class="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2.5 rounded-full text-xs">{eventProjectionUnavailable ? '—' : seasonEvents.length}</span>
    </button>
  </nav>
</div>

{#if activeTab === 'participants'}
  <!-- Participant Table Toolbar -->
  <div class="flex space-x-3 mb-2">
  <div class="relative flex-1">
    <div class="crm-ui-search-icon">
      <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
    </div>
    <input
      type="text"
      bind:value={participantSearch}
      class="block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[var(--crm-brand-border)] shadow-sm"
      placeholder="Search by name"
    >
  </div>
  <button
    type="button"
    on:click={exportParticipants}
    disabled={!seasonId || filteredParticipants.length === 0 || participantExportUnavailable}
    title={participantExportUnavailable
      ? 'Export is unavailable until the season registration, event, and financial projections are complete.'
      : filteredParticipants.length === 0
        ? 'There are no matching participants to export.'
        : undefined}
    class="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded text-sm font-semibold hover:bg-gray-50 flex items-center shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
  >
    Export
  </button>
  <p class="ml-auto text-xs text-gray-500">Participants are managed through registrations.</p>
</div>

<!-- Participants Table -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="border border-gray-200 rounded overflow-x-auto shadow-sm mt-4" role="region" tabindex="0" aria-label="Scrollable season participants table">
  {#if malformedRegistrationCount > 0}
    <p class="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
      {malformedRegistrationCount} malformed registration {malformedRegistrationCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.
    </p>
  {/if}
  {#if $seasonRegistrationsProjectionScope.truncated}
    <p class="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
      The season registration projection is limited. Counts and export are unavailable.
    </p>
  {/if}
  <table class="crm-ui-table">
    <thead class="bg-white">
      <tr>
        <th scope="col" class="crm-ui-th-blue">Registration ID</th>
        <th scope="col" class="crm-ui-th-blue">Status</th>
        <th scope="col" class="crm-ui-th-blue">Date &uarr;</th>
        <th scope="col" class="crm-ui-th-blue">Participant</th>
        <th scope="col" class="crm-ui-th-blue">Financials</th>
      </tr>
    </thead>
    <tbody class="bg-white divide-y divide-gray-100">
      {#if $seasonRegistrationsProjectionScope.loading}
        <tr><td colspan="5" class="px-4 py-16 text-center text-gray-500 text-sm"><span role="status">Loading season participants…</span></td></tr>
      {:else if $seasonRegistrationsProjectionScope.error}
        <tr><td colspan="5" class="px-4 py-16 text-center text-red-700 text-sm"><span role="alert">{$seasonRegistrationsProjectionScope.error}</span></td></tr>
      {:else if filteredParticipants.length === 0}
        <tr>
          <td colspan="5" class="px-4 py-16 text-center text-gray-400 text-sm">
            <p class="mb-4">No data found</p>
          </td>
        </tr>
      {:else}
        {#each filteredParticipants as p (p.id)}
          <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-[var(--crm-brand-link)] font-semibold">{p.id.substring(0, 8).toUpperCase()}</td>
            <td class="crm-ui-td">{p.status}</td>
            <td class="crm-ui-td">{p.date ? p.date.toLocaleDateString('en-US') : 'Unavailable'}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-[var(--crm-brand-link)]"><button type="button" class="hover:underline" on:click={() => onNavigateTab('Roster', p.registrationId)}>{p.name}</button></td>
            <td class="crm-ui-td">{p.financialStatus}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
{/if}

{#if activeTab === 'events'}
  <!-- Events Toolbar -->
  <div class="flex justify-between items-center mb-4">
    <h3 class="text-lg font-semibold text-gray-900">Events</h3>
    <button type="button" disabled={!seasonId || $eventsProjectionScope.loading || Boolean($eventsProjectionScope.error)} class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-4 py-2 rounded text-sm font-semibold hover:bg-[var(--crm-brand-primary-hover)] flex items-center shadow-sm disabled:opacity-50" on:click={() => showLinkEventModal = true}>
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
      Add / Link Event
    </button>
  </div>

  {#if eventMutationReceipt}
    <p class="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900" role="status">
      {eventMutationReceipt}
    </p>
  {/if}

  <!-- Events Table -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="border border-gray-200 rounded overflow-x-auto shadow-sm" role="region" tabindex="0" aria-label="Scrollable season events table">
    {#if malformedEventCount > 0}
      <p class="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        {malformedEventCount} malformed event {malformedEventCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.
      </p>
    {/if}
    {#if $eventsProjectionScope.truncated}
      <p class="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        The event projection is limited. The season event list and financial scope may be incomplete.
      </p>
    {/if}
    <table class="crm-ui-table">
      <thead class="bg-gray-50">
        <tr>
          <th scope="col" class="crm-ui-th-muted">Event Name</th>
          <th scope="col" class="crm-ui-th-muted">Date & Time</th>
          <th scope="col" class="crm-ui-th-muted">Type</th>
          <th scope="col" class="crm-ui-th-muted">Status</th>
          <th scope="col" class="crm-ui-th-muted">Actions</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#if $eventsProjectionScope.loading}
          <tr><td colspan="5" class="px-6 py-12 text-center text-gray-500 text-sm"><span role="status">Loading season events…</span></td></tr>
        {:else if $eventsProjectionScope.error}
          <tr><td colspan="5" class="px-6 py-12 text-center text-red-700 text-sm"><span role="alert">{$eventsProjectionScope.error}</span></td></tr>
        {:else if seasonEvents.length === 0}
          <tr>
            <td colspan="5" class="px-6 py-12 text-center text-gray-500 text-sm">
              <p>No events linked to this season yet.</p>
              <button type="button" disabled={!seasonId} class="mt-4 text-[var(--crm-brand-link)] hover:underline font-medium disabled:opacity-50" on:click={() => showLinkEventModal = true}>
                Add your first event
              </button>
            </td>
          </tr>
        {:else}
          {#each seasonEvents as event (event.id)}
            <tr class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{event.title}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {event.date ? (event.date.toDate ? event.date.toDate() : new Date(event.date)).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'No date'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{event.type || 'N/A'}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${event.lifecycleStatus === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {event.lifecycleStatus || 'Unsupported status'}
                </span>
              </td>
              <td class="px-6 py-4">
                <button type="button" disabled={unlinkState === 'loading'} class="text-sm font-semibold text-red-700 disabled:opacity-50" on:click={() => beginUnlink(event)}>Unlink</button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
  {#if unlinkCandidate}
    <div class="mt-3 rounded-md border border-red-200 bg-red-50 p-4">
      <p class="font-semibold text-red-950">Unlink {unlinkCandidate.title}?</p>
      <p class="text-xs text-red-800">The event remains intact but leaves this season. Its registrations, messages, and payment records remain attached to the event; season totals and event grouping can change immediately.</p>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-xs text-red-950">Audit reason
          <input type="text" bind:value={unlinkReason} disabled={unlinkState === 'loading'} minlength="3" maxlength="500" class="crm-ui-field mt-1" />
        </label>
        <label class="text-xs text-red-950">Type {unlinkText}
          <input type="text" bind:value={unlinkConfirmation} disabled={unlinkState === 'loading'} autocomplete="off" class="crm-ui-field mt-1" />
        </label>
      </div>
      {#if unlinkError}<p class="mt-2 text-sm text-red-900" role="alert">{unlinkError}</p>{/if}
      <div class="mt-3 flex gap-2">
        <button type="button" disabled={unlinkState === 'loading' || unlinkReason.trim().length < 3 || unlinkConfirmation !== unlinkText} on:click={unlinkEvent} class="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{unlinkState === 'loading' ? 'Unlinking…' : 'Confirm unlink'}</button>
        <button type="button" disabled={unlinkState === 'loading'} on:click={cancelUnlink} class="rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-900 disabled:opacity-50">Cancel</button>
      </div>
    </div>
  {/if}
{/if}
