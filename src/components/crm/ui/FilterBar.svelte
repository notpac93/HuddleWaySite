<script lang="ts">
  import Icon from './Icon.svelte';

  export let value = '';
  export let label = 'Search';
  export let placeholder = 'Search records';
  export let resultSummary = '';
  export let hasActiveFilters = false;
  export let onClear: () => void = () => {};
</script>

<section class="rounded-lg border border-gray-200 bg-white p-3" aria-label="Workspace filters">
  <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
    <label class="min-w-56 flex-1 text-sm font-medium text-gray-700">
      {label}
      <span class="relative mt-1 block">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          class="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[var(--crm-brand-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--crm-brand-focus)]"
          bind:value
          {placeholder}
        />
      </span>
    </label>
    <div class="flex flex-1 flex-wrap items-end gap-3"><slot /></div>
    {#if hasActiveFilters}
      <button type="button" class="crm-ui-button-secondary min-h-10" on:click={onClear}>Clear filters</button>
    {/if}
  </div>
  {#if resultSummary}<p class="mt-2 text-xs font-medium text-gray-500" aria-live="polite">{resultSummary}</p>{/if}
</section>
