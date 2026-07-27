<script lang="ts">
  import CrmShell from '../../src/components/crm/CrmShell.svelte';

  let activeTab = 'Activity';
  let activeResultId: string | null = null;
  const tabs = [
    { name: 'Activity', icon: '' },
    { name: 'Roster', icon: '' },
    { name: 'Teams', icon: '' },
    { name: 'Events', icon: '' },
  ];
</script>

<CrmShell bind:activeTab bind:activeResultId {tabs}>
  <output aria-label="current tab">{activeTab}</output>
  <output aria-label="current result id">{activeResultId || ''}</output>
</CrmShell>
