<script lang="ts">
  import CrmShell from '../../src/components/crm/CrmShell.svelte';
  import RosterManager from '../../src/components/crm/roster/RosterManager.svelte';

  let activeTab = 'Roster';
  let activeTeam: { id: string; name: string } | null = { id: 'esports', name: 'Esports' };
  const tabs = [{ name: 'Teams' }, { name: 'Roster' }];
  // Match CrmApp's existing exit destination; returning to Roster must use null scope.
  function exitTeam() { activeTeam = null; activeTab = 'Teams'; }
</script>

<CrmShell bind:activeTab {tabs} {activeTeam} onExitTeam={exitTeam}>
  {#if activeTab === 'Roster'}
    <RosterManager {activeTeam} />
  {:else}
    <h2>Organization teams</h2>
  {/if}
</CrmShell>
