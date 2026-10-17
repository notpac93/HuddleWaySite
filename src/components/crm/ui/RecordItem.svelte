<script lang="ts">
  import Icon from './Icon.svelte';
  export let title: string;
  export let context = '';
  export let status = '';
  export let date = '';
  export let value = '';
  export let expanded = false;
</script>

<details class="record-item" bind:open={expanded}>
  <summary>
    <span class="record-heading"><span class="record-title">{title}</span><span class="record-chevron"><Icon name="chevronRight" size={20} /></span></span>
    {#if context}<span class="record-context">{context}</span>{/if}
    <span class="record-meta">
      {#if status}<span class="record-status">{status}</span>{/if}
      {#if date}<span>{date}</span>{/if}
      {#if value}<strong class="record-value">{value}</strong>{/if}
    </span>
  </summary>
  <div class="record-details"><slot /></div>
</details>

<style>
  .record-item { min-width:0; border-bottom:1px solid #e5e7eb; }
  .record-item:last-child { border-bottom:0; }
  summary { list-style:none; padding:1rem; cursor:pointer; }
  summary::-webkit-details-marker { display:none; }
  summary:focus-visible { outline:2px solid var(--crm-brand-focus); outline-offset:-2px; border-radius:12px; }
  .record-heading { display:flex; align-items:start; gap:.75rem; }
  .record-title { flex:1; min-width:0; font-size:1rem; line-height:1.5; font-weight:600; overflow-wrap:anywhere; word-break:normal; }
  .record-chevron { flex-shrink:0; margin-top:2px; transition:transform .18s ease; }
  details[open] .record-chevron { transform:rotate(90deg); }
  .record-context { display:block; margin-top:.25rem; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; word-break:normal; }
  .record-meta { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem .75rem; margin-top:.75rem; font-size:.8125rem; }
  .record-status { border-radius:6px; padding:.15rem .45rem; background:var(--crm-brand-surface); color:var(--crm-on-brand-surface); }
  .record-value { margin-left:auto; font-variant-numeric:tabular-nums; white-space:nowrap; font-size:1rem; }
  .record-details { padding:0 1rem 1rem; overflow-wrap:anywhere; word-break:normal; }
  .record-details :global(dl) { margin:0 0 1rem; padding-top:.75rem; border-top:1px solid #e5e7eb; }
  .record-details :global(dt) { font-size:.8125rem; margin-top:.75rem; opacity:.75; }
  .record-details :global(dd) { margin:.2rem 0 0; font-size:1rem; line-height:1.5; white-space:pre-wrap; }
  @media (prefers-reduced-motion:reduce) { .record-chevron { transition:none; } }
</style>
