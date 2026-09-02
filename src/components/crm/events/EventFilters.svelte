<script lang="ts">
  export let search = '';
  export let teamId = '';
  export let status = '';
  export let seasonId = '';
  export let fromDate = '';
  export let toDate = '';
  export let teams: Array<{ id: string; name: string }> = [];
  export let seasons: Array<{ id: string; name: string }> = [];
  export let teamLocked = false;

  $: activeCount = [search, teamId, status, seasonId, fromDate, toDate].filter(Boolean).length;
  function clear() {
    const lockedTeamId = teamLocked ? teamId : '';
    search = '';
    teamId = lockedTeamId;
    status = '';
    seasonId = '';
    fromDate = '';
    toDate = '';
  }
</script>

<section class="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-label="Event filters">
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
    <label class="lg:col-span-2"><span class="crm-ui-label-xs">Search</span><input type="search" bind:value={search} class="crm-ui-input bg-white" placeholder="Title, location, or type" /></label>
    <label><span class="crm-ui-label-xs">Team{teamLocked ? ' · scope locked' : ''}</span><select bind:value={teamId} disabled={teamLocked} class="crm-ui-input bg-white disabled:bg-gray-100"><option value="">All teams</option>{#each teams as team}<option value={team.id}>{team.name}</option>{/each}</select></label>
    <label><span class="crm-ui-label-xs">Status</span><select bind:value={status} class="crm-ui-input bg-white"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <label><span class="crm-ui-label-xs">Season</span><select bind:value={seasonId} class="crm-ui-input bg-white"><option value="">All seasons</option>{#each seasons as season}<option value={season.id}>{season.name}</option>{/each}</select></label>
    <div class="flex items-end"><button type="button" class="crm-ui-button-secondary w-full bg-white" disabled={!activeCount || (teamLocked && activeCount === 1 && Boolean(teamId))} on:click={clear}>Clear {activeCount ? `${activeCount} filters` : 'filters'}</button></div>
  </div>
  <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
    <label><span class="crm-ui-label-xs">From date</span><input type="date" bind:value={fromDate} class="crm-ui-input bg-white" /></label>
    <label><span class="crm-ui-label-xs">Through date</span><input type="date" bind:value={toDate} min={fromDate || undefined} class="crm-ui-input bg-white" /></label>
  </div>
</section>
