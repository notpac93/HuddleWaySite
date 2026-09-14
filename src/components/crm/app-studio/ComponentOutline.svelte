<script lang="ts">
  import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';
  import { componentState } from './componentStudioDraft';
  import ComponentThumbnail from './ComponentThumbnail.svelte';

  export let page: CrmComponentStudioPage;
  export let definitions: CrmComponentDefinition[] = [];
  export let selectedId = '';
  export let disabled = false;
  export let onSelect: (component: CrmPageComponent) => void;
  export let onMove: (index: number, direction: -1 | 1) => void;
  export let onAdd: () => void;

  function definitionFor(component: CrmPageComponent) {
    return definitions.find((definition) => definition.id === component.definitionId);
  }
</script>

<section aria-labelledby="component-outline-title" class="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 id="component-outline-title" class="font-semibold text-gray-950">{page.title}</h3>
      <p class="mt-1 text-xs text-gray-500">{page.components.length} components · shown in family-app order</p>
    </div>
    <button type="button" class="crm-ui-button-primary whitespace-nowrap" disabled={disabled} on:click={onAdd}>+ Add</button>
  </div>
  {#if page.components.filter((item) => item.enabled && item.isVisible).length > 6}
    <p class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Long page: families will scroll through more than six visible components.</p>
  {/if}
  <ol class="mt-4 space-y-2">
    {#each page.components as component, index (component.id)}
      <li>
        <div class="rounded-lg border p-2 {selectedId === component.id ? 'crm-theme-selected' : 'border-gray-200'}">
          <button type="button" class="block w-full min-w-0 rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-[var(--crm-brand-focus)]" aria-label={`Edit ${component.label} component`} aria-pressed={selectedId === component.id} on:click={() => onSelect(component)}>
            <ComponentThumbnail {component} />
            <span class="block truncate text-sm font-semibold text-gray-950">{component.label}</span>
            <span class="mt-1 block text-xs text-gray-500">{definitionFor(component)?.previewSpec.description || component.type}</span>
            <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium {componentState(component, definitionFor(component)) === 'Needs attention' ? 'text-amber-800' : 'text-gray-700'}">{componentState(component, definitionFor(component))}</span>
          </button>
          <div class="mt-2 flex justify-end gap-1 border-t border-gray-100 pt-2">
            <button type="button" class="rounded border px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${component.label} up`} disabled={disabled || index === 0} on:click={() => onMove(index, -1)}>↑</button>
            <button type="button" class="rounded border px-2 py-1 text-xs disabled:opacity-30" aria-label={`Move ${component.label} down`} disabled={disabled || index === page.components.length - 1} on:click={() => onMove(index, 1)}>↓</button>
          </div>
        </div>
      </li>
    {/each}
  </ol>
</section>
