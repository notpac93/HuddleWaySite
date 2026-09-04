<script lang="ts">
  import type { CrmComponentDefinition, CrmComponentStudioPage } from '../../../lib/api/BackendApi';
  import { definitionAvailable } from './componentStudioDraft';

  export let definitions: CrmComponentDefinition[] = [];
  export let page: CrmComponentStudioPage;
  export let onChoose: (definition: CrmComponentDefinition) => void;
  export let onClose: () => void;
  let query = '';

  $: filtered = definitions.filter((definition) => {
    const search = `${definition.label} ${definition.category} ${definition.previewSpec.description}`.toLowerCase();
    return search.includes(query.trim().toLowerCase());
  });
</script>

<section aria-labelledby="component-library-title" class="rounded-xl border border-gray-200 bg-white p-5">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h3 id="component-library-title" class="text-lg font-semibold text-gray-950">Add to {page.title}</h3>
      <p class="mt-1 text-sm text-gray-600">Choose one component to inspect in the real family-app renderer before adding it.</p>
    </div>
    <button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={onClose}>Close</button>
  </div>
  {#if definitions.length > 6}
    <label class="mt-4 block text-sm font-medium text-gray-700">Search components
      <input type="search" bind:value={query} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Hero, schedule, staff…" />
    </label>
  {/if}
  <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each filtered as definition (definition.id)}
      <article class="flex min-h-48 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div class="flex min-h-24 items-center justify-center bg-gradient-to-br from-slate-100 to-[var(--crm-brand-surface)] p-4 text-center">
          <div>
            <p class="crm-theme-link text-xs font-semibold uppercase tracking-wide">{definition.category}</p>
            <p class="mt-2 font-semibold text-gray-950">{definition.previewSpec.title || definition.label}</p>
            <p class="mt-1 text-xs text-gray-500">Select for live isolated preview</p>
          </div>
        </div>
        <div class="flex flex-1 flex-col p-4">
          <h4 class="font-semibold text-gray-950">{definition.label}</h4>
          <p class="mt-1 flex-1 text-sm text-gray-600">{definition.previewSpec.description || 'A reusable family-app component.'}</p>
          <button
            type="button"
            class="crm-ui-button-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!definitionAvailable(definition, page)}
            on:click={() => onChoose(definition)}
          >
            {definitionAvailable(definition, page) ? 'Preview and add' : 'Already on this page'}
          </button>
        </div>
      </article>
    {/each}
  </div>
  {#if definitions.length === 0}
    <p class="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
      The versioned component library is not available yet. Existing components remain visible for review, but editing and adding are disabled so their contracts cannot be guessed.
    </p>
  {:else if filtered.length === 0}
    <p class="mt-5 text-sm text-gray-600">No components match that search.</p>
  {/if}
</section>
