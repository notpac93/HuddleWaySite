<script lang="ts">
  import Financials from './Financials.svelte';
  import BillingPackagesWorkspace from './billing/BillingPackagesWorkspace.svelte';

  export let activeTeam: { id?: string; name?: string } | string | null = null;
  let workspace: 'records' | 'payment_setup' = 'records';
</script>

<div class="flex h-full min-h-0 flex-col bg-gray-50">
  <header class="shrink-0 border-b border-gray-200 bg-white px-4 pt-4 sm:px-6">
    <h1 class="crm-ui-page-title">Financials</h1>
    <p class="mt-1 text-sm text-gray-600">Investigate payments and exceptions, reconcile records, or configure what families may pay.</p>
  <nav class="mt-3 flex gap-2 pb-3" aria-label="Financial workspace">
    <button type="button" aria-pressed={workspace === 'records'} class="rounded-full border px-4 py-2 text-sm font-semibold {workspace === 'records' ? 'border-[var(--crm-brand-border)] bg-[var(--crm-brand-surface)] text-[var(--crm-on-brand-surface)]' : 'border-gray-200 bg-white text-gray-700'}" on:click={() => workspace = 'records'}>Financial records</button>
    <button type="button" aria-pressed={workspace === 'payment_setup'} class="rounded-full border px-4 py-2 text-sm font-semibold {workspace === 'payment_setup' ? 'border-[var(--crm-brand-border)] bg-[var(--crm-brand-surface)] text-[var(--crm-on-brand-surface)]' : 'border-gray-200 bg-white text-gray-700'}" on:click={() => workspace = 'payment_setup'}>Payment setup</button>
  </nav>
  </header>
  <div class="min-h-0 flex-1">
    {#if workspace === 'records'}
      <Financials {activeTeam} />
    {:else}
      <BillingPackagesWorkspace />
    {/if}
  </div>
</div>
