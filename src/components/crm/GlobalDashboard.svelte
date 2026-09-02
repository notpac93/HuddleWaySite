<script lang="ts">
  import type { Component } from 'svelte';
  import {
    financialProjectionScope,
    transactionsStore,
  } from '../../lib/services/DataStore';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';

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
  async function loadDashboardSummary(tenantId: string) {
    const generation = ++dashboardSummaryGeneration;
    dashboardSummary = {
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
    } else {
      dashboardSummaryGeneration += 1;
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

  // Keep totals separated by currency and format integer minor units only.
  $: revenueProjection = $transactionsStore.reduce((projection, transaction) => {
    if (transaction.status !== 'succeeded') return projection;
    const amount = Number(transaction.grossAmount);
    const currency = typeof transaction.currency === 'string'
      && /^[A-Za-z]{3}$/.test(transaction.currency.trim())
      ? transaction.currency.trim().toUpperCase()
      : '';
    if (!Number.isSafeInteger(amount) || !currency) {
      projection.invalid += 1;
      return projection;
    }
    projection.totals.set(
      currency,
      (projection.totals.get(currency) || 0) + amount,
    );
    return projection;
  }, { totals: new Map<string, number>(), invalid: 0 });
  $: revenueTotals = Array.from(revenueProjection.totals.entries()) as [string, number][];
  $: invalidRevenueRecords = revenueProjection.invalid;
  $: revenueUnavailable =
    $financialProjectionScope.loading
    || $financialProjectionScope.truncated.transactions
    || invalidRevenueRecords > 0
    || Boolean($financialProjectionScope.error);

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
        participantName: humanName(registration, participant),
        email: humanText(
          payer.email,
          registration.participantEmail,
          registration.email,
        ),
        createdAt: registration.createdAt,
      };
    });

</script>

<div class="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-gray-50">
  <div>
    <p class="text-sm font-medium text-gray-500">Overview of your organization's key metrics.</p>
    {#if !canManageTenant}
      <p class="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
        Viewer access is read-only. Editing controls are unavailable.
      </p>
    {/if}
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
  <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
    <!-- Total Revenue -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m5-16H9a3 3 0 000 6h6a3 3 0 010 6H7" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Successful payment revenue</dt>
              <dd>
                {#if revenueUnavailable}
                  <div class="crm-ui-subtitle">
                    {$financialProjectionScope.loading ? 'Loading…' : 'Unavailable'}
                  </div>
                  <div class="crm-ui-hint-xs">
                    {$financialProjectionScope.loading
                      ? 'Loading financial projection'
                      : 'Limited or invalid financial projection'}
                  </div>
                {:else if revenueTotals.length === 0}
                  <div class="crm-ui-subtitle">No successful payments</div>
                {:else}
                  {#each revenueTotals as [currency, total]}
                    <div class="crm-ui-subtitle">{currency} {formatCurrency(total, currency)}</div>
                  {/each}
                {/if}
              </dd>
              {#if $financialProjectionScope.error}
                <dd class="mt-1 text-xs text-red-700" role="alert">{$financialProjectionScope.error}</dd>
              {/if}
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Total Players -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Registration Records</dt>
              <dd>
                <div class="crm-ui-subtitle">{totalPlayers}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Teams -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
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
    </div>

    <!-- Events -->
    <div class="bg-white overflow-hidden shadow rounded-lg">
      <div class="p-5">
        <div class="crm-ui-center">
          <div class="flex-shrink-0 bg-[var(--crm-brand-surface)] rounded-md p-3">
            <svg class="h-6 w-6 text-[var(--crm-brand-link)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 3v4m10-4v4M5 10h14v11H5z" />
            </svg>
          </div>
          <div class="ml-5 w-0 flex-1">
            <dl>
              <dt class="text-sm font-medium text-gray-500 truncate">Events Managed</dt>
              <dd>
                <div class="crm-ui-subtitle">{totalEvents}</div>
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

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
          {#each recentRegistrations as reg}
            <li>
              <div class="px-4 py-4 sm:px-6 hover:bg-gray-50">
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
              </div>
            </li>
          {/each}
          {#if operationalLoading}
            <li><div class="px-4 py-12 text-center text-sm text-gray-500">Loading registrations…</div></li>
          {:else if operationalError}
            <li><div class="px-4 py-12 text-center text-sm text-red-700">{operationalError}</div></li>
          {:else if recentRegistrations.length === 0}
            <li>
              <div class="px-4 py-12 text-center sm:px-6 text-gray-500 text-sm">
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button type="button" on:click={openCreateEvent} class="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 hover:border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-surface)] transition-colors">
            <svg class="h-8 w-8 text-[var(--crm-brand-link)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span class="text-sm font-medium text-gray-900">Create Event</span>
          </button>

          <button type="button" on:click={openStaffInvite} disabled={!isOwner} title={!isOwner ? 'Only organization owners can invite staff.' : undefined} class="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 hover:border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-surface)] transition-colors disabled:cursor-not-allowed disabled:opacity-50">
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
