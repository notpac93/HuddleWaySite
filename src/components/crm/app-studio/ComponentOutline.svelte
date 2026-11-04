<script lang="ts">
  import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';
  import { componentState } from './componentStudioDraft';
  import ComponentThumbnail from './ComponentThumbnail.svelte';
  import { validLocations, locationLabel, type LayoutLocation } from './componentLayoutCommands';

  export let page: CrmComponentStudioPage;
  export let definitions: CrmComponentDefinition[] = [];
  export let selectedId = '';
  export let disabled = false;
  export let compact = false;
  export let onSelect: (component: CrmPageComponent) => void;
  export let onMove: (index: number, direction: -1 | 1) => void;
  export let onAdd: () => void;
  export let onInsert: (beforeId: string | null) => void = () => onAdd();
  export let onMoveTo: (id: string, location: LayoutLocation) => void = () => {};
  let draggingId = '';

  function drop(event: DragEvent, beforeId: string | null) {
    event.preventDefault();
    if (!disabled && draggingId) onMoveTo(draggingId, { beforeId });
    draggingId = '';
  }

  function definitionFor(component: CrmPageComponent) {
    return definitions.find((definition) => definition.id === component.definitionId);
  }
  function without(component: CrmPageComponent) {
    return { ...page, components: page.components.filter((item) => item.id !== component.id) };
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
        {#if component.type !== 'hero_section'}
          <div role="group" aria-label={`Insert before ${component.label}`} on:dragover|preventDefault on:drop={(event) => drop(event, component.id)}>
            <button type="button" class="my-1 w-full rounded border border-dashed border-gray-300 py-1 text-xs text-gray-600" disabled={disabled} on:click={() => onInsert(component.id)}>+ Add here</button>
          </div>
        {/if}
        <div class="rounded-lg border p-2 {selectedId === component.id ? 'crm-theme-selected' : 'border-gray-200'}">
          <button type="button" class="block w-full min-w-0 rounded p-1 text-left focus:outline-none focus:ring-2 focus:ring-[var(--crm-brand-focus)]" aria-label={`Edit ${component.label} component`} aria-pressed={selectedId === component.id} on:click={() => onSelect(component)}>
            {#if !compact}<ComponentThumbnail {component} />{/if}
            <span class="block truncate text-sm font-semibold text-gray-950">{component.label}</span>
            {#if !compact}<span class="mt-1 block text-xs text-gray-500">{definitionFor(component)?.previewSpec.description || component.type}</span>{/if}
            <span class="mt-2 inline-flex items-center gap-1 text-xs font-medium {componentState(component, definitionFor(component)) === 'Needs attention' ? 'text-amber-800' : 'text-gray-700'}">{componentState(component, definitionFor(component))}</span>
          </button>
          <div class="mt-2 flex justify-end gap-1 border-t border-gray-100 pt-2">
            {#if component.type === 'hero_section'}
              <span class="text-xs text-gray-500">Pinned first</span>
            {:else}
              <button type="button" draggable={!disabled} disabled={disabled} aria-label={`Drag ${component.label} to rearrange; or use Move controls`} class="cursor-grab rounded border px-3 py-2" on:dragstart={(event) => { draggingId = component.id; event.dataTransfer?.setData('text/plain', component.id); }} on:dragend={() => draggingId = ''} on:keydown={(event) => { if (event.key === 'Escape') draggingId = ''; }}>⠿</button>
              <button type="button" class="rounded border px-3 py-2 text-xs disabled:opacity-30" aria-label={`Move ${component.label} up`} disabled={disabled || index === 0 || page.components[index - 1]?.type === 'hero_section'} on:click={() => onMove(index, -1)}>↑</button>
              <button type="button" class="rounded border px-3 py-2 text-xs disabled:opacity-30" aria-label={`Move ${component.label} down`} disabled={disabled || index === page.components.length - 1} on:click={() => onMove(index, 1)}>↓</button>
              <select aria-label={`Move ${component.label} to`} class="min-w-0 max-w-36 rounded border text-xs" disabled={disabled} value="" on:change={(event) => { onMoveTo(component.id, { beforeId: event.currentTarget.value || null }); event.currentTarget.value = ''; }}>
                <option value="" disabled>Move to…</option>
                {#each validLocations(without(component)) as location}
                  {#if location.beforeId !== component.id}
                    <option value={location.beforeId || ''}>{locationLabel(without(component), location)}</option>
                  {/if}
                {/each}
              </select>
            {/if}
          </div>
        </div>
      </li>
    {/each}
    <li role="group" aria-label="Insert at end" on:dragover|preventDefault on:drop={(event) => drop(event, null)}>
      <button type="button" class="w-full rounded border border-dashed border-gray-300 py-2 text-xs text-gray-600" disabled={disabled} on:click={() => onInsert(null)}>+ Add at end</button>
    </li>
  </ol>
</section>
