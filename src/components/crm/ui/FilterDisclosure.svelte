<script lang="ts">
  export let activeCount = 0;
  export let label = 'Search & filters';
</script>

<details class="filter-disclosure">
  <summary>{label}{#if activeCount > 0}<span class="filter-count">{activeCount} active</span>{/if}</summary>
  <div class="filter-content"><slot /></div>
</details>

<style>
  .filter-disclosure { margin-block: .5rem; }
  summary { cursor: pointer; width: fit-content; min-height: 44px; padding: .65rem .8rem; border: 1px solid #d1d5db; border-radius: 999px; font-size: .875rem; font-weight: 600; color: var(--crm-brand-link); background: white; }
  summary:focus-visible { outline: 2px solid var(--crm-brand-focus); outline-offset: 2px; }
  .filter-count { margin-left: .5rem; font-size: .75rem; }
  .filter-content { margin-top: .75rem; }
</style>
