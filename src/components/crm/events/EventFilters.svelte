<script lang="ts">
  export let itemPlural = 'Events';
  export let group = 'Team';
  export let groups = 'Teams';
  export let defaultStatus = '';
  let expanded = false;
  export let search = '';
  export let teamId = '';
  export let status = '';
  export let seasonId = '';
  export let fromDate = '';
  export let toDate = '';
  export let teams: Array<{ id: string; name: string }> = [];
  export let seasons: Array<{ id: string; name: string }> = [];
  export let teamLocked = false;

  $: activeCount = [search, teamLocked ? '' : teamId, status !== defaultStatus ? status : '', seasonId, fromDate, toDate].filter(Boolean).length;
  function clear() {
    const lockedTeamId = teamLocked ? teamId : '';
    search = '';
    teamId = lockedTeamId;
    status = defaultStatus;
    seasonId = '';
    fromDate = '';
    toDate = '';
  }
</script>

<section aria-label={`${itemPlural} filters`}>
  <div class="flex items-center gap-2">
    <input type="search" aria-label={`Search ${itemPlural.toLowerCase()}`} bind:value={search} class="crm-ui-input min-w-0 flex-1 bg-white" placeholder={`Search ${itemPlural.toLowerCase()}`} />
    <button type="button" class="crm-ui-button-secondary shrink-0" aria-expanded={expanded} on:click={() => expanded = !expanded}>Filters{activeCount ? ` (${activeCount})` : ''}</button>
  </div>
  {#if expanded}
  <div class="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
    {#if teams.length || teamLocked}<label><span class="crm-ui-label-xs">{group}</span><select bind:value={teamId} disabled={teamLocked} class="crm-ui-input bg-white"><option value="">All {groups.toLowerCase()}</option>{#each teams as team}<option value={team.id}>{team.name}</option>{/each}</select></label>{/if}
    <label><span class="crm-ui-label-xs">Status</span><select bind:value={status} class="crm-ui-input bg-white"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    {#if seasons.length}<label><span class="crm-ui-label-xs">Season</span><select bind:value={seasonId} class="crm-ui-input bg-white"><option value="">All seasons</option>{#each seasons as season}<option value={season.id}>{season.name}</option>{/each}</select></label>{/if}
    <label><span class="crm-ui-label-xs">From date</span><input type="date" bind:value={fromDate} class="crm-ui-input bg-white" /></label>
    <label><span class="crm-ui-label-xs">Through date</span><input type="date" bind:value={toDate} min={fromDate || undefined} class="crm-ui-input bg-white" /></label>
    <div class="flex items-end"><button type="button" class="crm-ui-button-secondary bg-white" disabled={!activeCount} on:click={clear}>Clear filters</button></div>
  </div>
  {/if}
</section>
