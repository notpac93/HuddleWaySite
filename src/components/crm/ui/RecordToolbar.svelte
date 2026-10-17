<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';

  export let activeCount = 0;
  export let searchable = true;
  export let expanded = false;
  export let label = 'Search and filters';
  let panel: HTMLDivElement;

  async function toggle() {
    expanded = !expanded;
    await tick();
    if (expanded) panel?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }
</script>

<div class="record-toolbar">
  <div class="toolbar-line">
    <div class="toolbar-view"><slot name="view" /></div>
    <div class="toolbar-actions">
      <slot name="actions" />
      {#if searchable}
        <button type="button" class="search-toggle" aria-label={expanded ? 'Close search and filters' : label} aria-expanded={expanded} on:click={toggle}>
          <Icon name={expanded ? 'close' : 'search'} size={20} />
          {#if activeCount > 0}<span class="active-count" aria-label={`${activeCount} active filters`}>{activeCount}</span>{/if}
        </button>
      {/if}
    </div>
  </div>
  <div class="filter-panel" bind:this={panel} hidden={!expanded || !searchable}><slot /></div>
</div>

<style>
  .record-toolbar { min-width: 0; }
  .toolbar-line { display:flex; align-items:center; justify-content:space-between; gap:.75rem; min-height:44px; }
  .toolbar-view { flex:1; min-width:0; }
  .toolbar-view :global(select) { max-width:100%; min-height:44px; border:0; padding:.5rem 1.75rem .5rem 0; background-color:transparent; color:inherit; font-size:1rem; font-weight:600; text-overflow:ellipsis; }
  .toolbar-actions { display:flex; align-items:center; gap:.5rem; flex-shrink:0; }
  .search-toggle { position:relative; display:grid; place-items:center; width:44px; height:44px; border:0; border-radius:50%; color:var(--crm-brand-link); background:transparent; cursor:pointer; }
  .search-toggle[aria-expanded=true] { background:var(--crm-brand-surface); color:var(--crm-on-brand-surface); }
  .search-toggle:focus-visible { outline:2px solid var(--crm-brand-focus); outline-offset:2px; }
  .active-count { position:absolute; top:0; right:0; min-width:18px; border-radius:9px; font-size:.75rem; background:var(--crm-brand-surface); color:var(--crm-on-brand-surface); }
  .filter-panel { margin-top:.75rem; padding:1rem; border-radius:12px; background:var(--crm-brand-surface); color:var(--crm-on-brand-surface); }
  .filter-panel[hidden] { display:none; }
  .filter-panel :global(input), .filter-panel :global(select) { max-width:100%; min-width:0; font-size:1rem; }
</style>
