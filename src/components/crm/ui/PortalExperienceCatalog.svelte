<script lang="ts">
  import ChangeReceipt from './ChangeReceipt.svelte';
  import DetailDrawer from './DetailDrawer.svelte';
  import EmptyState from './EmptyState.svelte';
  import FilterBar from './FilterBar.svelte';
  import Icon from './Icon.svelte';
  import LoadingState from './LoadingState.svelte';
  import PageHeader from './PageHeader.svelte';
  import StatusNotice from './StatusNotice.svelte';

  let query = '';
  let hasActiveFilters = false;
  let showDrawer = false;
  let showReceipt = true;

  function clearFilters() {
    query = '';
    hasActiveFilters = false;
  }
</script>

<div class="h-full overflow-y-auto bg-gray-50 p-4 sm:p-8">
  <div class="mx-auto max-w-6xl space-y-8">
    <PageHeader
      eyebrow="Development-only catalog"
      title="Operations Portal experience system"
      support="Review shared components, content states, motion, focus, and tenant-safe styling before feature pages adopt them."
      freshness="Foundation contract · 2026-09-02"
    >
      <svelte:fragment slot="actions">
        <button type="button" class="crm-ui-button-secondary min-h-11" on:click={() => showDrawer = true}>Open detail drawer</button>
        <button type="button" class="crm-ui-button-primary min-h-11" on:click={() => showReceipt = true}>Show receipt</button>
      </svelte:fragment>
    </PageHeader>

    <section class="space-y-3" aria-labelledby="catalog-status-title">
      <h2 id="catalog-status-title" class="text-lg font-bold text-gray-950">Status notices</h2>
      <div class="grid gap-3 lg:grid-cols-2">
        <StatusNotice tone="info" title="Current information" message="This state explains useful context without blocking work." />
        <StatusNotice tone="success" title="Changes saved" message="The authoritative response confirmed this operation." />
        <StatusNotice tone="warning" title="Review needed" message="Two records require attention before publication." actionLabel="Review records" />
        <StatusNotice tone="danger" title="Import incomplete" message="Eight rows succeeded and two need correction. Valid work was preserved." actionLabel="Fix two rows" />
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="catalog-filter-title">
      <h2 id="catalog-filter-title" class="text-lg font-bold text-gray-950">Workspace filters</h2>
      <FilterBar
        bind:value={query}
        label="Search participants"
        placeholder="Name, guardian, or email"
        resultSummary={query ? `Showing results for “${query}”` : '24 participants'}
        {hasActiveFilters}
        onClear={clearFilters}
      >
        <label class="text-sm font-medium text-gray-700">
          Status
          <select class="mt-1 block min-h-10 rounded-md border border-gray-300 bg-white px-3 text-sm" on:change={() => hasActiveFilters = true}>
            <option>All statuses</option>
            <option>Active</option>
            <option>Needs review</option>
          </select>
        </label>
      </FilterBar>
    </section>

    <section class="space-y-3" aria-labelledby="catalog-loading-title">
      <h2 id="catalog-loading-title" class="text-lg font-bold text-gray-950">Loading and empty states</h2>
      <div class="grid gap-4 lg:grid-cols-2">
        <LoadingState label="Loading roster…" rows={3} />
        <EmptyState
          icon="teams"
          title="No teams yet"
          message="Create a team to organize players, staff, seasons, and events."
          primaryLabel="Create team"
          secondaryLabel="Learn about teams"
        />
      </div>
    </section>

    <section class="space-y-3" aria-labelledby="catalog-icons-title">
      <h2 id="catalog-icons-title" class="text-lg font-bold text-gray-950">Navigation icon family</h2>
      <div class="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-4 lg:grid-cols-7">
        {#each [
          ['dashboard', 'Dashboard'], ['teams', 'Teams'], ['seasons', 'Seasons'],
          ['roster', 'Roster'], ['events', 'Events'], ['registration', 'Registration'],
          ['financials', 'Financials'], ['messages', 'Messages'], ['documents', 'Documents'],
          ['staff', 'Staff'], ['media', 'Media'], ['myApp', 'My App'],
          ['profile', 'My profile'], ['activity', 'Activity'],
        ] as item}
          <div class="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border border-gray-100 p-2 text-center text-xs font-medium text-gray-700">
            <Icon name={item[0]} size={24} className="text-[var(--crm-brand-link)]" />
            <span>{item[1]}</span>
          </div>
        {/each}
      </div>
    </section>

    {#if showReceipt}
      <ChangeReceipt
        status="partial"
        title="Roster import partially completed"
        message="Eight players were added. Two rows need correction before they can be applied."
        reference="demo-operation-2026-09-02"
        retryLabel="Review two rows"
        onDismiss={() => showReceipt = false}
      />
    {/if}
  </div>
</div>

{#if showDrawer}
  <DetailDrawer title="Jordan Lee" support="Participant · 12U Gold" onClose={() => showDrawer = false}>
    <dl class="space-y-4 text-sm">
      <div><dt class="font-medium text-gray-500">Status</dt><dd class="mt-1 text-gray-950">Active</dd></div>
      <div><dt class="font-medium text-gray-500">Guardian</dt><dd class="mt-1 text-gray-950">Morgan Lee</dd></div>
      <div><dt class="font-medium text-gray-500">Current season</dt><dd class="mt-1 text-gray-950">Fall 2026</dd></div>
    </dl>
    <svelte:fragment slot="actions">
      <div class="flex justify-end gap-3">
        <button type="button" class="crm-ui-button-secondary" on:click={() => showDrawer = false}>Close</button>
        <button type="button" class="crm-ui-button-primary" on:click={() => showDrawer = false}>Edit participant</button>
      </div>
    </svelte:fragment>
  </DetailDrawer>
{/if}
