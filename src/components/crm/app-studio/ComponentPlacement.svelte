<script lang="ts">
  import type { CrmComponentStudioPage } from '../../../lib/api/BackendApi';
  import { locationLabel, validLocations, type LayoutLocation } from './componentLayoutCommands';
  export let page: CrmComponentStudioPage;
  export let location: LayoutLocation;
  export let disabled = false;
  export let onChange: (location: LayoutLocation) => void;
</script>

<label class="block rounded-xl border border-[var(--crm-brand-border)] bg-[var(--crm-brand-surface)] p-3 text-sm font-medium text-gray-900">
  Add position on {page.title}
  <select class="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2" disabled={disabled} value={location.beforeId || ''} on:change={(event) => onChange({ beforeId: event.currentTarget.value || null })}>
    {#each validLocations(page) as option}
      <option value={option.beforeId || ''}>{locationLabel(page, option)}</option>
    {/each}
  </select>
  <span class="mt-2 block text-xs font-normal">Preview only. Choose Add to page to keep it in your draft.</span>
</label>
