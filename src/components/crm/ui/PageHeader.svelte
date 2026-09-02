<script lang="ts">
  export let title: string;
  export let support = '';
  export let eyebrow = '';
  export let freshness = '';
</script>

<header class="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    {#if eyebrow}
      <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--crm-brand-link)]">{eyebrow}</p>
    {/if}
    <h2 class="text-2xl font-bold leading-8 text-gray-950">{title}</h2>
    {#if support}
      <p class="mt-1 max-w-3xl text-sm leading-5 text-gray-600">{support}</p>
    {/if}
    {#if freshness}
      <p class="mt-2 text-xs font-medium text-gray-500">{freshness}</p>
    {/if}
  </div>
  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <slot name="actions" />
  </div>
</header>
