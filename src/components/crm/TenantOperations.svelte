<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BackendApiError,
    type TenantOperationsTenant,
    type TenantOperationsTenantPage,
  } from '../../lib/api/BackendApi';
  import { backendClient } from '../../lib/api/backendClient';

  let page: TenantOperationsTenantPage | null = null;
  let selectedTenant: TenantOperationsTenant | null = null;
  let loading = true;
  let refreshing = false;
  let errorMessage = '';
  let environment = 'all';
  let search = '';
  let status = 'all';
  let publicState = 'all';
  let health = 'all';

  const numberFormatter = new Intl.NumberFormat('en-US');

  function formattedNumber(value: number) {
    return numberFormatter.format(value || 0);
  }

  function formattedTimestamp(value: string | null | undefined) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Not available'
      : new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
  }

  function friendlyToken(value: string) {
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function safeError(error: unknown) {
    if (error instanceof BackendApiError) {
      if (error.status === 403) {
        return 'This login does not have Tenant Operations access.';
      }
      return error.message;
    }
    return 'Tenant inventory could not be loaded. Check the backend connection and try again.';
  }

  async function loadInventory(forceRefresh = false) {
    errorMessage = '';
    if (forceRefresh) refreshing = true;
    else loading = true;
    try {
      page = await backendClient.tenantOperationsTenants({
        environment: environment as 'all' | 'development' | 'production',
        search,
        status,
        publicState,
        health,
        limit: 100,
        refresh: forceRefresh,
      });
      if (
        selectedTenant
        && !page.tenants.some(
          (tenant) =>
            tenant.tenantId === selectedTenant?.tenantId
            && tenant.environment === selectedTenant?.environment,
        )
      ) {
        selectedTenant = null;
      }
    } catch (error) {
      errorMessage = safeError(error);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function clearFilters() {
    search = '';
    environment = 'all';
    status = 'all';
    publicState = 'all';
    health = 'all';
    void loadInventory();
  }

  onMount(() => {
    void loadInventory();
  });
</script>

<svelte:head>
  <title>Tenant Operations | HuddleWay CRM</title>
</svelte:head>

<div class="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
  <div class="mx-auto max-w-[1600px] space-y-6">
    <header class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span
              class="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] {page?.environment === 'production'
                ? 'bg-red-100 text-red-800'
                : page?.environment === 'all'
                  ? 'bg-violet-100 text-violet-800'
                  : 'bg-blue-100 text-blue-800'}"
            >
              {page?.environment === 'all' ? 'All environments' : `${page?.environment ?? 'Loading'} environment`}
            </span>
            <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
              Read only
            </span>
          </div>
          <h1 class="text-2xl font-bold text-slate-950 sm:text-3xl">
            Tenant Operations
          </h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            One read-only view of every Development and Production tenant. Counts are calculated by the backend and personal account details are not included.
          </p>
        </div>
        <div class="flex flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            class="inline-flex items-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={refreshing || loading}
            on:click={() => loadInventory(true)}
          >
            {refreshing ? 'Refreshing…' : 'Refresh live inventory'}
          </button>
          <p class="text-xs text-slate-500">
            Generated {formattedTimestamp(page?.generatedAt)}
            {#if page?.freshness.source === 'cache'} · cached for up to one minute{/if}
          </p>
        </div>
      </div>
      {#if page?.environment === 'all'}
        <div class="border-t border-violet-200 bg-violet-50 px-6 py-3 text-sm font-medium text-violet-950">
          Development and Production are visible together. Every row is labeled with its source environment; maintenance actions are disabled in this release.
        </div>
      {/if}
    </header>

    {#if errorMessage}
      <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">
        {errorMessage}
      </div>
    {/if}

    {#if page}
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tenant inventory summary">
        {#each [
          ['Total tenants', page.summary.totalTenants, 'All tenant records in this environment'],
          ['Public tenants', page.summary.publicTenants, 'Active programs visible to consumers'],
          ['Needs attention', page.summary.criticalTenants + page.summary.warningTenants, `${page.summary.criticalTenants} critical · ${page.summary.warningTenants} warning`],
          ['Duplicate candidates', page.summary.duplicateCandidates, 'Programs with likely matching identities'],
          ['Accounts', page.summary.accounts, 'Unique accounts associated with tenants'],
          ['Consumers', page.summary.consumers, 'Accounts without a staff role'],
          ['Staff', page.summary.staff, 'Owner, admin, coach, editor, or viewer roles'],
          ['Incomplete tenants', page.summary.incompleteTenants, 'Missing a recognized tenant status'],
        ] as card}
          <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-semibold text-slate-600">{card[0]}</p>
            <p class="mt-2 text-3xl font-bold text-slate-950">{formattedNumber(Number(card[1]))}</p>
            <p class="mt-2 text-xs leading-5 text-slate-500">{card[2]}</p>
          </article>
        {/each}
      </section>
    {/if}

    <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form
        class="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_160px_180px_180px_180px_auto]"
        on:submit|preventDefault={() => loadInventory()}
        >
        <label class="text-sm font-semibold text-slate-700">
          Environment
          <select bind:value={environment} class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All environments</option>
            <option value="development">Development</option>
            <option value="production">Production</option>
          </select>
        </label>
        <label class="text-sm font-semibold text-slate-700">
          Search tenants
          <input
            type="search"
            bind:value={search}
            placeholder="Program name or tenant ID"
            class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
        </label>
        <label class="text-sm font-semibold text-slate-700">
          Tenant state
          <select bind:value={status} class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="missing">Missing status</option>
          </select>
        </label>
        <label class="text-sm font-semibold text-slate-700">
          Public state
          <select bind:value={publicState} class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="hidden">Active, hidden</option>
            <option value="ineligible">Not eligible</option>
          </select>
        </label>
        <label class="text-sm font-semibold text-slate-700">
          Health
          <select bind:value={health} class="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All health</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="healthy">Healthy</option>
          </select>
        </label>
        <div class="flex items-end gap-2">
          <button type="submit" on:click|preventDefault={() => loadInventory()} class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Apply
          </button>
          <button type="button" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" on:click={clearFilters}>
            Clear
          </button>
        </div>
      </form>

      {#if loading}
        <div class="flex min-h-64 items-center justify-center p-10" role="status">
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-b-blue-600"></div>
          <span class="sr-only">Loading tenant inventory</span>
        </div>
      {:else if page && page.tenants.length > 0}
        <div class="overflow-x-auto">
          <table class="min-w-[1320px] w-full border-collapse text-left text-sm">
            <thead class="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-3 font-bold">Environment</th>
                <th class="px-5 py-3 font-bold">Program</th>
                <th class="px-3 py-3 font-bold">State</th>
                <th class="px-3 py-3 font-bold">Public</th>
                <th class="px-3 py-3 font-bold">Health</th>
                <th class="px-3 py-3 text-right font-bold">Pages</th>
                <th class="px-3 py-3 text-right font-bold">Teams</th>
                <th class="px-3 py-3 text-right font-bold">Events</th>
                <th class="px-3 py-3 text-right font-bold">Registrations</th>
                <th class="px-3 py-3 text-right font-bold">Forms</th>
                <th class="px-3 py-3 text-right font-bold">Billing</th>
                <th class="px-3 py-3 text-right font-bold">Accounts</th>
                <th class="px-3 py-3 text-right font-bold">Staff</th>
                <th class="px-5 py-3 text-right font-bold">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              {#each page.tenants as tenant}
                <tr class="bg-white hover:bg-slate-50">
                  <td class="px-3 py-4">
                    <span class="rounded-full px-2.5 py-1 text-xs font-bold {tenant.environment === 'production' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                      {tenant.environment === 'production' ? 'Production' : 'Development'}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <p class="font-semibold text-slate-950">{tenant.programName}</p>
                    <p class="mt-1 font-mono text-xs text-slate-500">{tenant.tenantId}</p>
                  </td>
                  <td class="px-3 py-4">
                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {friendlyToken(tenant.tenantState)}
                    </span>
                  </td>
                  <td class="px-3 py-4">
                    <span class="rounded-full px-2.5 py-1 text-xs font-semibold {tenant.publicState === 'public' ? 'bg-emerald-100 text-emerald-800' : tenant.publicState === 'hidden' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}">
                      {friendlyToken(tenant.publicState)}
                    </span>
                  </td>
                  <td class="px-3 py-4">
                    <span class="rounded-full px-2.5 py-1 text-xs font-semibold {tenant.health === 'critical' ? 'bg-red-100 text-red-800' : tenant.health === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                      {friendlyToken(tenant.health)}
                    </span>
                  </td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.pages)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.teams)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.events)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.registrations)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.forms)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.counts.billing)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.accounts)}</td>
                  <td class="px-3 py-4 text-right tabular-nums">{formattedNumber(tenant.staff)}</td>
                  <td class="px-5 py-4 text-right">
                    <button
                      type="button"
                      class="font-semibold text-blue-700 hover:text-blue-900"
                      on:click={() => selectedTenant = tenant}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600">
          <span>Showing {page.tenants.length} of {page.totalFiltered} matching tenants</span>
          {#if page.hasMore}
            <span class="font-medium text-amber-700">Additional results require the next page.</span>
          {/if}
        </footer>
      {:else if page}
        <div class="p-12 text-center">
          <h2 class="text-lg font-semibold text-slate-900">No tenants match these filters</h2>
          <p class="mt-2 text-sm text-slate-600">Clear the filters or refresh the live inventory.</p>
        </div>
      {/if}
    </section>
  </div>
</div>

{#if selectedTenant}
  <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="presentation" on:click={() => selectedTenant = null}>
    <aside
      class="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-detail-title"
      on:click|stopPropagation
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.14em] {selectedTenant.environment === 'production' ? 'text-red-700' : 'text-blue-700'}">{selectedTenant.environment} tenant</p>
          <h2 id="tenant-detail-title" class="mt-2 text-2xl font-bold text-slate-950">{selectedTenant.programName}</h2>
          <p class="mt-1 font-mono text-sm text-slate-500">{selectedTenant.tenantId}</p>
        </div>
        <button type="button" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" on:click={() => selectedTenant = null}>
          Close
        </button>
      </div>

      <div class="mt-6 grid grid-cols-3 gap-3">
        <div class="rounded-lg bg-slate-100 p-3">
          <p class="text-xs font-semibold text-slate-500">Tenant state</p>
          <p class="mt-1 font-bold text-slate-900">{friendlyToken(selectedTenant.tenantState)}</p>
        </div>
        <div class="rounded-lg bg-slate-100 p-3">
          <p class="text-xs font-semibold text-slate-500">Public state</p>
          <p class="mt-1 font-bold text-slate-900">{friendlyToken(selectedTenant.publicState)}</p>
        </div>
        <div class="rounded-lg bg-slate-100 p-3">
          <p class="text-xs font-semibold text-slate-500">Health</p>
          <p class="mt-1 font-bold text-slate-900">{friendlyToken(selectedTenant.health)}</p>
        </div>
      </div>

      <section class="mt-7">
        <h3 class="text-base font-bold text-slate-950">Operational inventory</h3>
        <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each Object.entries(selectedTenant.counts) as [label, count]}
            <div class="rounded-lg border border-slate-200 p-3">
              <dt class="text-xs font-semibold text-slate-500">{friendlyToken(label)}</dt>
              <dd class="mt-1 text-xl font-bold text-slate-950">{formattedNumber(count)}</dd>
            </div>
          {/each}
        </dl>
      </section>

      <section class="mt-7">
        <h3 class="text-base font-bold text-slate-950">Account relationships</h3>
        <dl class="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          <div class="flex justify-between p-3"><dt>Associated accounts</dt><dd class="font-bold">{selectedTenant.accounts}</dd></div>
          <div class="flex justify-between p-3"><dt>Consumer accounts</dt><dd class="font-bold">{selectedTenant.consumers}</dd></div>
          <div class="flex justify-between p-3"><dt>Staff accounts</dt><dd class="font-bold">{selectedTenant.staff}</dd></div>
        </dl>
      </section>

      <section class="mt-7">
        <h3 class="text-base font-bold text-slate-950">Setup checks</h3>
        <dl class="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          <div class="flex justify-between p-3"><dt>Branding record</dt><dd class="font-bold">{selectedTenant.branding.exists ? 'Present' : 'Missing'}</dd></div>
          <div class="flex justify-between p-3"><dt>Logo</dt><dd class="font-bold">{selectedTenant.branding.hasLogo ? 'Present' : 'Missing'}</dd></div>
          <div class="flex justify-between p-3"><dt>Home page</dt><dd class="font-bold">{selectedTenant.home.exists ? friendlyToken(selectedTenant.home.status) : 'Missing'}</dd></div>
          <div class="flex justify-between p-3"><dt>Last tenant update</dt><dd class="font-bold">{formattedTimestamp(selectedTenant.updatedAt)}</dd></div>
        </dl>
      </section>

      <section class="mt-7">
        <h3 class="text-base font-bold text-slate-950">Health findings</h3>
        {#if selectedTenant.findings.length > 0}
          <div class="mt-3 space-y-3">
            {#each selectedTenant.findings as finding}
              <article class="rounded-lg border p-4 {finding.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}">
                <p class="font-mono text-xs font-bold uppercase tracking-wide text-slate-600">{finding.code}</p>
                <p class="mt-2 text-sm font-medium text-slate-900">{finding.message}</p>
                {#if finding.relatedTenantIds?.length}
                  <p class="mt-2 text-xs text-slate-600">Related: {finding.relatedTenantIds.join(', ')}</p>
                {/if}
              </article>
            {/each}
          </div>
        {:else}
          <p class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
            No current health findings.
          </p>
        {/if}
      </section>
    </aside>
  </div>
{/if}
