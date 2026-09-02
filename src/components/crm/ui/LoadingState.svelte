<script lang="ts">
  export let label = 'Loading content…';
  export let rows = 4;
  export let mode: 'skeleton' | 'processing' = 'skeleton';
</script>

<div class="rounded-lg border border-gray-200 bg-white p-5" role="status" aria-live="polite">
  <p class="sr-only">{label}</p>
  {#if mode === 'processing'}
    <div class="flex min-h-32 flex-col items-center justify-center gap-3 text-gray-600">
      <span class="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-b-[var(--crm-brand-primary)]"></span>
      <span class="text-sm font-medium">{label}</span>
    </div>
  {:else}
    <div class="space-y-3" aria-hidden="true">
      {#each Array(rows) as _}
        <div class="animate-pulse rounded-md border border-gray-100 p-4">
          <div class="h-4 w-1/3 rounded bg-gray-200"></div>
          <div class="mt-3 h-3 w-2/3 rounded bg-gray-100"></div>
        </div>
      {/each}
    </div>
  {/if}
</div>
