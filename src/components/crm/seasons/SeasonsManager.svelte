<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import {
    DataStore,
    eventsProjectionScope,
    eventsStore,
    financialProjectionScope,
    invoicesStore,
    seasonRegistrationsProjectionScope,
    seasonRegistrationsStore,
    seasonsProjectionScope,
    seasonsStore,
    transactionsStore,
  } from '../../../lib/services/DataStore';
  import CreateSeasonModal from './CreateSeasonModal.svelte';
  import EditSeasonModal from './EditSeasonModal.svelte';
  import SeasonDetail from './SeasonDetail.svelte';
  import ChangeReceipt from '../ui/ChangeReceipt.svelte';

  export let activeTeam: any = null;
  export let onNavigateTab: (tab: string, id?: string | null) => void = () => {};

  let showCreateModal = false;
  let editingSeason: any = null;
  let selectedSeason: any = null;
  let selectedSeasonSignature = '';
  let searchQuery = '';
  let viewMode: 'cards' | 'table' = 'cards';
  let statusFilter = 'all';
  let dateFilter = 'all';
  let loadedTenantId = '';
  let viewPreferenceLoaded = false;
  let filteredSeasons: any[] = [];
  let seasonReceipt: { title: string; message: string } | null = null;

  const statuses = ['active', 'upcoming', 'completed', 'archived'];
  const fallbackImage = '/crm-season-placeholder.svg';
  const columns = [
    'Name',
    'Status',
    'Dates',
    'Registrations',
    'Collected Revenue',
  ];

  function dateKey(value: any) {
    if (!value) return '';
    const date = new Date(value.toMillis ? value.toMillis() : value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function dateLabel(value: any) {
    const key = dateKey(value);
    return key
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).format(new Date(`${key}T00:00:00.000Z`))
      : 'TBD';
  }

  function money(value: unknown, currency: string) {
    const amount = Number(value);
    return Number.isSafeInteger(amount)
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
        }).format(amount / 100)
      : 'Invalid amount';
  }

  function decorate(season: any) {
    const financials = DataStore.getSeasonFinancials(season.id);
    const status = String(season.status || '').trim().toLowerCase();
    const registrationUnavailable =
      $seasonRegistrationsProjectionScope.loading
      || Boolean($seasonRegistrationsProjectionScope.error)
      || $seasonRegistrationsProjectionScope.truncated;
    return {
      ...season,
      displayName: String(season.name || season.title || 'Unnamed Season'),
      status: statuses.includes(status) ? status : '',
      statusLabel: statuses.includes(status)
        ? `${status.charAt(0).toUpperCase()}${status.slice(1)}`
        : 'Unsupported status',
      dates: `${dateLabel(season.startDate)} - ${dateLabel(season.endDate)}`,
      registrations: registrationUnavailable
        ? 'Unavailable'
        : String(financials.participants),
      revenue:
        financials.financialRecordCount === 0
          ? 'No records'
          : financials.totalsAvailable && financials.currency
            ? money(financials.totalCollected, financials.currency)
            : 'Unavailable',
    };
  }

  $: normalizedSeasons = $seasonsStore.map((season) => ({
    ...season,
    id: String(season?.id || '').trim(),
  }));
  $: malformedSeasonCount =
    normalizedSeasons.filter((season) => !season.id).length;
  $: activeTeamId = String(activeTeam?.id || '').trim();
  $: scopedSeasons = normalizedSeasons.filter((season) =>
    season.id && (!activeTeamId || season.teamId === activeTeamId)
  );
  $: {
    $transactionsStore;
    $invoicesStore;
    $eventsStore;
    $seasonRegistrationsStore;
    $financialProjectionScope;
    filteredSeasons = scopedSeasons
      .filter((season) =>
        String(season.name || season.title || '')
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      )
      .filter((season) => statusFilter === 'all' || String(season.status || '').toLowerCase() === statusFilter)
      .filter((season) => {
        if (dateFilter === 'all') return true;
        const today = new Date().toISOString().slice(0, 10);
        const start = dateKey(season.startDate);
        const end = dateKey(season.endDate);
        if (dateFilter === 'current') return (!start || start <= today) && (!end || end >= today);
        if (dateFilter === 'future') return Boolean(start && start > today);
        return Boolean(end && end < today);
      })
      .map(decorate);
  }
  $: if (viewPreferenceLoaded && typeof window !== 'undefined') window.localStorage.setItem('huddleway-season-view', viewMode);
  $: if (selectedSeason) {
    const source = scopedSeasons.find(
      (season) => season.id === selectedSeason.id,
    );
    if (!source && !$seasonsProjectionScope.loading) {
      selectedSeason = null;
      selectedSeasonSignature = '';
    } else if (source) {
      const signature = JSON.stringify({
        id: source.id,
        name: source.name,
        title: source.title,
        status: source.status,
        startDate: dateKey(source.startDate),
        endDate: dateKey(source.endDate),
        imageUrl: source.imageUrl,
        description: source.description,
        teamId: source.teamId,
        registrationFormId: source.registrationFormId,
      });
      if (signature !== selectedSeasonSignature) {
        selectedSeasonSignature = signature;
        selectedSeason = decorate(source);
      }
    }
  }
  $: if (($tenantIdStore || '') !== loadedTenantId) {
    loadedTenantId = $tenantIdStore || '';
    selectedSeason = null;
    selectedSeasonSignature = '';
    editingSeason = null;
    showCreateModal = false;
  }

  function openSeason(season: any) {
    selectedSeasonSignature = '';
    selectedSeason = season;
  }

  function handleSeasonCreated(event: CustomEvent<{ id: string; name: string }>) {
    seasonReceipt = {
      title: 'Season created',
      message: `${event.detail?.name || 'The season'} was created and the season list was refreshed.`,
    };
  }

  function handleSeasonUpdated() {
    seasonReceipt = {
      title: 'Season updated',
      message: `${editingSeason?.displayName || editingSeason?.name || 'The season'} was updated and the season list was refreshed.`,
    };
  }

  function imageFallback(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image.src !== fallbackImage) image.src = fallbackImage;
  }

  onMount(() => {
    const saved = window.localStorage.getItem('huddleway-season-view');
    if (saved === 'cards' || saved === 'table') viewMode = saved;
    viewPreferenceLoaded = true;
  });
</script>

<div class="h-full overflow-y-auto bg-gray-50/50 p-6 md:p-8">
  {#if seasonReceipt}
    <div class="mb-6">
      <ChangeReceipt status="success" title={seasonReceipt.title} message={seasonReceipt.message} onDismiss={() => seasonReceipt = null} />
    </div>
  {/if}
  {#if selectedSeason}
    <SeasonDetail
      season={selectedSeason}
      {onNavigateTab}
      on:back={() => {
        selectedSeason = null;
        selectedSeasonSignature = '';
      }}
    />
  {:else}
    <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Seasons & Leagues</h2>
        <p class="crm-ui-hint-xs">Manage seasons, registration links, payment scope, rosters, and events.</p>
      </div>
      <button
          type="button"
          disabled={$seasonsProjectionScope.loading || Boolean($seasonsProjectionScope.error)}
          on:click={() => showCreateModal = true}
          class="rounded-lg bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] disabled:opacity-50"
        >
          Create Season
      </button>
    </header>

    <section class="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-3" aria-label="Season list controls">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label class="min-w-0 flex-1">
          <span class="sr-only">Search seasons</span>
          <input type="search" bind:value={searchQuery} class="crm-ui-field bg-white" placeholder="Search seasons by name..." />
        </label>
        <label class="text-sm font-medium text-gray-600">Status
          <select class="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" bind:value={statusFilter}><option value="all">All statuses</option>{#each statuses as status}<option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>{/each}</select>
        </label>
        <label class="text-sm font-medium text-gray-600">Dates
          <select class="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" bind:value={dateFilter}><option value="all">Any date</option><option value="current">In progress</option><option value="future">Future</option><option value="past">Past</option></select>
        </label>
        <div class="flex shrink-0 items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">View</span>
          <div class="flex rounded-lg bg-gray-200 p-0.5">
            <button type="button" aria-pressed={viewMode === 'cards'} on:click={() => viewMode = 'cards'} class="rounded-md px-3 py-1 text-xs font-semibold {viewMode === 'cards' ? 'bg-white shadow-xs' : ''}">Cards</button>
            <button type="button" aria-pressed={viewMode === 'table'} on:click={() => viewMode = 'table'} class="rounded-md px-3 py-1 text-xs font-semibold {viewMode === 'table' ? 'bg-white shadow-xs' : ''}">Table</button>
          </div>
        </div>
      </div>
    </section>

    {#if $seasonsProjectionScope.truncated}
      <p class="crm-ui-notice-card mt-4" role="status">Only the first {$seasonsProjectionScope.limit} seasons are loaded. Search and counts may be incomplete.</p>
    {/if}
    {#if $eventsProjectionScope.truncated || $seasonRegistrationsProjectionScope.truncated}
      <p class="crm-ui-notice-card mt-4" role="status">Event or registration data is limited. Season counts and revenue scope may be incomplete.</p>
    {/if}
    {#if $financialProjectionScope.truncated.transactions || $financialProjectionScope.truncated.invoices}
      <p class="crm-ui-notice-card mt-4" role="status">Financial records are limited. Revenue is unavailable instead of showing an incomplete total.</p>
    {/if}
    {#if malformedSeasonCount}
      <p class="crm-ui-notice-card mt-4" role="status">{malformedSeasonCount} malformed season {malformedSeasonCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.</p>
    {/if}

    {#if $seasonsProjectionScope.loading}
      <div class="crm-ui-empty mt-6" role="status">Loading seasons…</div>
    {:else if $seasonsProjectionScope.error}
      <div class="crm-ui-danger mt-6" role="alert">{$seasonsProjectionScope.error}</div>
    {:else if viewMode === 'cards'}
      <div class="mt-6 grid gap-6">
        {#each filteredSeasons as season (season.id)}
          <article class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex flex-col items-center gap-4 sm:flex-row">
              <img src={season.imageUrl || fallbackImage} alt={season.displayName} width="128" height="96" loading="lazy" decoding="async" class="h-24 w-32 rounded-lg object-cover" on:error={imageFallback} />
              <div class="min-w-0 flex-1">
                <h3 class="crm-ui-title">{season.displayName}</h3>
                <p class="text-sm text-[var(--crm-brand-link)]">{season.dates}</p>
                <p class="mt-1 text-xs text-gray-500">{season.statusLabel} · {season.registrations} registrations · {season.revenue}</p>
              </div>
              <div class="flex gap-2">
                <button type="button" on:click={() => openSeason(season)} class="rounded-md bg-[var(--crm-brand-control)] px-3 py-2 text-xs font-semibold text-[var(--crm-on-primary)]">View Details</button>
                <button type="button" on:click={() => editingSeason = season} class="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-[var(--crm-brand-link)]">Edit</button>
              </div>
            </div>
          </article>
        {:else}
          <div class="crm-ui-empty">{scopedSeasons.length === 0 ? 'No seasons yet. Create one to organize registration, roster assignment, events, and payment setup.' : 'No seasons match these filters.'}</div>
        {/each}
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white" role="region" tabindex="0" aria-label="Scrollable seasons table">
        <table class="crm-ui-table">
          <thead><tr>{#each columns as column}<th scope="col" class="crm-ui-th-muted">{column}</th>{/each}<th scope="col" class="crm-ui-th-muted">Actions</th></tr></thead>
          <tbody>
            {#each filteredSeasons as season (season.id)}
              <tr>
                <td class="crm-ui-td"><button type="button" class="font-semibold text-[var(--crm-brand-link)]" on:click={() => openSeason(season)}>{season.displayName}</button></td>
                <td class="crm-ui-td">{season.statusLabel}</td>
                <td class="crm-ui-td">{season.dates}</td>
                <td class="crm-ui-td">{season.registrations}</td>
                <td class="crm-ui-td">{season.revenue}</td>
                <td class="crm-ui-td"><button type="button" class="font-semibold text-[var(--crm-brand-link)]" on:click={() => editingSeason = season}>Edit</button></td>
              </tr>
            {:else}
              <tr><td colspan={columns.length + 1} class="crm-ui-empty">{scopedSeasons.length === 0 ? 'No seasons yet. Create one to enable season-based payment setup and organization.' : 'No seasons match these filters.'}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

{#if showCreateModal}
  <CreateSeasonModal {activeTeam} on:success={handleSeasonCreated} on:close={() => showCreateModal = false} />
{/if}
{#if editingSeason}
  <EditSeasonModal season={editingSeason} on:success={handleSeasonUpdated} on:close={() => editingSeason = null} />
{/if}
