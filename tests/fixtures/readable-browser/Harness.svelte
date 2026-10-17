<script>
  import Financials from '../../../src/components/crm/FinancialOperationsWorkspace.svelte';
  import Staff from '../../../src/components/crm/StaffManager.svelte';
  import Documents from '../../../src/components/crm/DocumentsManager.svelte';
  import Members from '../../../src/components/crm/roster/RosterManager.svelte';
  import Classes from '../../../src/components/crm/EventScheduler.svelte';
  import { programProfileStore } from '../../../src/lib/crm/programVocabulary';
  programProfileStore.set({ tenantId:'fixture-yoga', profile:{ catalogVersion:1, profileId:'yoga', people:'Members', group:'Class', groups:'Classes' } });
  let screen='Financials';
</script>
<div class="crm-theme-default-host" style="--crm-brand-link:#315f4a;--crm-brand-control:#315f4a;--crm-brand-surface:#e8f1e7;--crm-on-brand-surface:#244a35;--crm-brand-border:#8cae95;--crm-brand-focus:#315f4a;--crm-on-primary:white;">
  <header class="flex flex-wrap items-center justify-between gap-3 border-b bg-white p-4"><span>Local fixture data</span><select aria-label="Preview screen" bind:value={screen}><option>Financials</option><option>Members</option><option>Classes</option><option>Staff</option><option>Documents</option></select></header>
  <main style="max-width:960px;margin:auto;min-height:700px;">
    {#if screen==='Financials'}<Financials />{:else if screen==='Staff'}<Staff />{:else if screen==='Documents'}<Documents />{:else if screen==='Members'}<Members />{:else}<Classes />{/if}
  </main>
</div>
