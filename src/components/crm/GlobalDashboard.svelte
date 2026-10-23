<script lang="ts">
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
  import type { Component } from 'svelte';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';

  export let onNavigateTab: (tab: string, id?: string | null) => void = () => {};

  let showCreateEventModal = false;
  let showAddStaffModal = false;
  let CreateEventFormComponent: Component<any> | null = null;
  let InviteStaffModalComponent: Component<any> | null = null;
  let quickActionLoadError = '';
  let dashboardSummary = {
    loading: false,
    counts: { registrations: 0, teams: 0, events: 0 },
    recentRegistrations: [] as Array<Record<string, unknown> & { id: string }>,
    error: '',
  };
  let loadedDashboardTenant = '';
  let dashboardSummaryGeneration = 0;

  async function openCreateEvent() {
    quickActionLoadError = '';
    showCreateEventModal = true;
    try {
      CreateEventFormComponent ??=
        (await import('./events/CreateEventForm.svelte')).default;
    } catch {
      console.error('Could not load event creation.');
      showCreateEventModal = false;
      quickActionLoadError =
        'Event creation could not be loaded. Check your connection and try again.';
    }
  }

  async function openStaffInvite() {
    quickActionLoadError = '';
    showAddStaffModal = true;
    try {
      InviteStaffModalComponent ??=
        (await import('./InviteStaffModal.svelte')).default;
    } catch {
      console.error('Could not load staff invitations.');
      showAddStaffModal = false;
      quickActionLoadError =
        'Staff invitations could not be loaded. Check your connection and try again.';
    }
  }

  // Quick stats
  $: isOwner =
    $activeTenantRole === 'owner'
    || $activeTenantRole === 'platform_admin';
  $: canManageTenant = isOwner || $activeTenantRole === 'editor';
  let paymentSummary = {
    loading: false, complete: false,
    totals: [] as Array<{ currency: string; grossAmount: number }>, error: '',
  };
  let paymentGeneration = 0;
  async function loadPaymentSummary(tenantId: string, silent = false) {
    const generation = ++paymentGeneration;
    if (!silent) paymentSummary = { loading: true, complete: false, totals: [], error: '' };
    try {
      const result = await backendClient.dashboardPayments(tenantId);
      if (generation !== paymentGeneration) return;
      paymentSummary = { ...result, loading: false, error: '' };
    } catch {
      if (generation !== paymentGeneration) return;
      paymentSummary = { loading: false, complete: false, totals: [], error: 'Payment totals could not be loaded.' };
    }
  }
  async function loadDashboardSummary(tenantId: string, silent = false) {
    const generation = ++dashboardSummaryGeneration;
    if (!silent) dashboardSummary = {
      loading: true,
      counts: { registrations: 0, teams: 0, events: 0 },
      recentRegistrations: [],
      error: '',
    };
    try {
      const summary = await backendClient.crmDashboardSummary(tenantId);
      if (generation !== dashboardSummaryGeneration) return;
      dashboardSummary = {
        loading: false,
        counts: summary.counts,
        recentRegistrations: summary.recentRegistrations,
        error: '',
      };
    } catch {
      if (generation !== dashboardSummaryGeneration) return;
      dashboardSummary = {
        loading: false,
        counts: { registrations: 0, teams: 0, events: 0 },
        recentRegistrations: [],
        error: 'Organization metrics could not be loaded.',
      };
    }
  }

  $: if ($tenantIdStore !== loadedDashboardTenant) {
    loadedDashboardTenant = $tenantIdStore || '';
    if (loadedDashboardTenant) {
      void loadDashboardSummary(loadedDashboardTenant);
      void loadPaymentSummary(loadedDashboardTenant);
    } else {
      dashboardSummaryGeneration += 1;
      paymentGeneration += 1;
      paymentSummary = { loading: false, complete: false, totals: [], error: '' };
      dashboardSummary = {
        loading: false,
        counts: { registrations: 0, teams: 0, events: 0 },
        recentRegistrations: [],
        error: '',
      };
    }
  }
  $: operationalLoading = dashboardSummary.loading;
  $: operationalError = dashboardSummary.error;
  $: totalPlayers = operationalLoading || operationalError
    ? '—'
    : String(dashboardSummary.counts.registrations);
  $: activeTeams = operationalLoading || operationalError
    ? '—'
    : String(dashboardSummary.counts.teams);
  $: totalEvents = operationalLoading || operationalError
    ? '—'
    : String(dashboardSummary.counts.events);

  $: revenueTotals = paymentSummary.totals.map(({ currency, grossAmount }) =>
    [currency, grossAmount] as [string, number]);
  $: revenueUnavailable = paymentSummary.loading || !paymentSummary.complete || Boolean(paymentSummary.error);

  // Format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount / 100);
  };

  function formatRegistrationDate(value: any) {
    const candidate = value?.toDate?.() || value || null;
    if (!candidate) return 'Registration date unavailable';
    const date = candidate instanceof Date ? candidate : new Date(candidate);
    return Number.isNaN(date.getTime())
      ? 'Registration date unavailable'
      : date.toLocaleDateString();
  }

  function humanText(...values: unknown[]) {
    return values
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .find(Boolean) || null;
  }

  function joinedName(source: Record<string, unknown>) {
    return [humanText(source.firstName), humanText(source.lastName)]
      .filter(Boolean)
      .join(' ');
  }

  function humanName(record: Record<string, unknown>, person: Record<string, unknown>) {
    return humanText(
      person.fullName,
      person.displayName,
      joinedName(person),
      record.participantName,
      record.displayName,
      joinedName(record),
    );
  }

  // Recent activity from authoritative registration records.
  $: recentRegistrations = dashboardSummary.recentRegistrations
    .map((registration) => {
      const participant = registration.participantSummary as Record<string, unknown> || {};
      const payer = registration.payerSummary as Record<string, unknown> || {};
      return {
        id: registration.id,
        participantName: humanName(registration, participant),
        email: humanText(
          payer.email,
          registration.participantEmail,
          registration.email,
        ),
        createdAt: registration.createdAt,
      };
    });
  $: incompleteRegistrationCount = recentRegistrations.filter((registration) => !registration.participantName || !registration.email).length;


  mountRefresh(() => registerLiveRefresh(() => loadedDashboardTenant ? Promise.all([loadDashboardSummary(loadedDashboardTenant, true), loadPaymentSummary(loadedDashboardTenant, true)]).then(() => undefined) : undefined));
</script>

<div class="dashboard h-full flex flex-col p-4 sm:p-6 space-y-5 overflow-y-auto bg-gray-50">
  <div class="flex items-center justify-between gap-3">
    <h2 class="text-2xl font-bold text-gray-950">Dashboard</h2>

  </div>
  {#if operationalLoading}
    <p class="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-600" role="status">
      Loading organization metrics…
    </p>
  {:else if operationalError}
    <p class="crm-ui-danger" role="alert">
      {operationalError}
    </p>
  {/if}

  <!-- KPI Cards -->
  <div class="dashboard-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
    <!-- Total Revenue -->
    <button type="button" class="overflow-hidden rounded-lg bg-white text-left shadow disabled:cursor-not-allowed disabled:opacity-60" disabled={!isOwner} title={!isOwner ? 'Financials require owner access.' : 'Successful payments · loaded history'} on:click={() => onNavigateTab('Financials')}>
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m5-16H9a3 3 0 000 6h6a3 3 0 010 6H7" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Payments received</dt>
              <dd>
                {#if revenueUnavailable}
                  <div class="crm-ui-subtitle">
                    {paymentSummary.loading ? 'Loading…' : 'Unavailable'}
                  </div>
                  <div class="crm-ui-hint-xs">
                    {paymentSummary.loading
                      ? 'Loading financial projection'
                      : 'Limited or invalid financial projection'}
                  </div>
                {:else if revenueTotals.length === 0}
                  <div class="crm-ui-subtitle">No payments</div>
                {:else}
                  {#each revenueTotals as [currency, total]}
                    <div class="crm-ui-subtitle">{currency} {formatCurrency(total, currency)}</div>
                  {/each}
                {/if}
              </dd>
              {#if paymentSummary.error}
                <dd class="mt-1 text-xs text-red-700" role="alert">{paymentSummary.error}</dd>
              {/if}
            </dl>
          </div>
        </div>
      </div>
    </button>

    <!-- Total Players -->
    <button type="button" class="overflow-hidden rounded-lg bg-white text-left shadow disabled:cursor-not-allowed disabled:opacity-60" disabled={!canManageTenant} on:click={() => onNavigateTab('Registration')}>
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Registrations</dt>
              <dd>
                <div class="crm-ui-subtitle">{totalPlayers}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </button>

    <!-- Active Teams -->
    <button type="button" class="overflow-hidden rounded-lg bg-white text-left shadow disabled:cursor-not-allowed disabled:opacity-60" disabled={!canManageTenant} on:click={() => onNavigateTab('Teams')}>
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16v4H4zm0 6h16v4H4z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Teams</dt>
              <dd>
                <div class="crm-ui-subtitle">{activeTeams}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </button>

    <!-- Events -->
    <button type="button" class="overflow-hidden rounded-lg bg-white text-left shadow disabled:cursor-not-allowed disabled:opacity-60" disabled={!canManageTenant} on:click={() => onNavigateTab('Events')}>
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 3v4m10-4v4M5 10h14v11H5z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Events</dt>
              <dd>
                <div class="crm-ui-subtitle">{totalEvents}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </button>
  </div>

  {#if incompleteRegistrationCount > 0 || revenueUnavailable}
    <section class="rounded-lg border border-amber-200 bg-amber-50 p-4" aria-labelledby="dashboard-attention-title">
      <h2 id="dashboard-attention-title" class="font-semibold text-amber-950">Needs attention</h2>
      <div class="mt-3 flex flex-wrap gap-3">
        {#if incompleteRegistrationCount > 0}<button type="button" class="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm disabled:opacity-60" disabled={!canManageTenant} on:click={() => onNavigateTab('Roster')}>{incompleteRegistrationCount} recent registration{incompleteRegistrationCount === 1 ? '' : 's'} {incompleteRegistrationCount === 1 ? 'has' : 'have'} incomplete contact details</button>{/if}
        {#if revenueUnavailable}<button type="button" class="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm disabled:opacity-60" disabled={!isOwner} on:click={() => onNavigateTab('Financials')}>Financial totals need reconciliation or a complete load</button>{/if}
      </div>
    </section>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Recent Registrations -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-4 py-5 border-b border-gray-200 sm:px-6">
        <h3 class="crm-ui-modal-title">
          Recent Registrations
        </h3>
      </div>
      <div class="bg-white overflow-hidden sm:rounded-md">
        <ul class="divide-y divide-gray-200">
          {#each recentRegistrations as reg (reg.id)}
            <li>
              <button type="button" class="w-full px-4 py-4 text-left hover:bg-gray-50 sm:px-6" on:click={() => onNavigateTab('Roster', reg.id)}>
                <div class="crm-ui-between">
                  <p class="text-sm font-medium text-[var(--crm-brand-link)] truncate">{reg.participantName || 'Participant name unavailable'}</p>
                </div>
                <div class="mt-2 sm:flex sm:justify-between">
                  <div class="sm:flex">
                    <p class="flex items-center text-sm text-gray-500">
                      {reg.email || 'Email unavailable'}
                    </p>
                    <p class="ml-0 mt-1 flex items-center text-xs text-gray-500 sm:ml-4 sm:mt-0">{formatRegistrationDate(reg.createdAt)}</p>
                  </div>
                </div>
                {#if !reg.participantName || !reg.email}<p class="mt-2 text-xs font-semibold text-amber-700">Registration details incomplete</p>{/if}
              </button>
            </li>
          {/each}
          {#if operationalLoading}
            <li><div class="px-4 py-7 text-center text-sm text-gray-500">Loading registrations…</div></li>
          {:else if operationalError}
            <li><div class="px-4 py-7 text-center text-sm text-red-700">{operationalError}</div></li>
          {:else if recentRegistrations.length === 0}
            <li>
              <div class="px-4 py-7 text-center sm:px-6 text-gray-500 text-sm">
                No recent registrations.
              </div>
            </li>
          {/if}
        </ul>
      </div>
    </div>

    <!-- Quick Actions -->
    {#if canManageTenant}
    <div class="bg-white shadow rounded-lg">
      <div class="px-4 py-5 border-b border-gray-200 sm:px-6">
        <h3 class="crm-ui-modal-title">Quick Actions</h3>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-2 gap-3">
          <button type="button" on:click={openCreateEvent} class="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-surface)] transition-colors">
            <svg class="h-8 w-8 text-[var(--crm-brand-link)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span class="text-sm font-medium text-gray-900">Create Event</span>
          </button>

          <button type="button" on:click={openStaffInvite} disabled={!isOwner} title={!isOwner ? 'Only organization owners can invite staff.' : undefined} class="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-surface)] transition-colors disabled:cursor-not-allowed disabled:opacity-50">
            <svg class="h-8 w-8 text-[var(--crm-brand-link)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span class="text-sm font-medium text-gray-900">Add Staff</span>
          </button>
        </div>
      </div>
    </div>
    {:else}
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h3 class="crm-ui-subtitle">Read-only access</h3>
        <p class="mt-2 text-sm text-gray-600">
          Ask an organization owner or editor to create events or perform other administrative changes.
        </p>
      </div>
    {/if}
  </div>

  {#if quickActionLoadError}
    <p class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
      {quickActionLoadError}
    </p>
  {/if}

  {#if showCreateEventModal && CreateEventFormComponent}
    <svelte:component
      this={CreateEventFormComponent}
      on:cancel={() => showCreateEventModal = false}
      on:success={() => showCreateEventModal = false}
    />
  {:else if showCreateEventModal}
    <p class="text-sm text-gray-600" role="status">Loading event creation…</p>
  {/if}

  {#if showAddStaffModal && InviteStaffModalComponent}
    <svelte:component
      this={InviteStaffModalComponent}
      on:close={() => showAddStaffModal = false}
      on:success={() => showAddStaffModal = false}
    />
  {:else if showAddStaffModal}
    <p class="text-sm text-gray-600" role="status">Loading staff invitation…</p>
  {/if}
</div>

<style>
  .dashboard-metrics > button { border: 1px solid #e5e7eb; border-radius: 20px; box-shadow: none; }
  .dashboard-metrics > button > div { padding: 18px; }
  .dashboard-metrics .crm-ui-center { align-items: flex-start; flex-direction: column; gap: 14px; }
  .dashboard-metrics .ml-5 { margin-left: 0; width: 100%; }
  .dashboard-metrics dt { white-space: normal; color: #4b5563; }
  .dashboard-metrics .crm-ui-subtitle { margin-top: 5px; font-size: 1.35rem; line-height: 1.25; font-weight: 650; }
  .dashboard-metrics .flex-shrink-0 { border-radius: 12px; padding: 9px; }
  @media (prefers-reduced-motion: no-preference) { .dashboard-metrics > button { transition: transform 120ms ease; } .dashboard-metrics > button:active { transform: scale(.98); } }
</style>
