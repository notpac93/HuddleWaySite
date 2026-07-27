<script lang="ts">
  import DataTable from '../DataTable.svelte';
  import CreateTeamForm from '../teams/CreateTeamForm.svelte';

  export let teams = [];
  export let setActiveTeam = () => {};
  export let loading = false;
  export let error = '';
  export let truncated = false;

  let showEditTeam = false;
  let editingTeam = null;
  $: sourceTeams = Array.isArray(teams) ? teams : [];
  $: truthfulTeams = sourceTeams
    .filter((team) => String(team?.id || '').trim())
    .map((team) => ({
    ...team,
    id: String(team.id).trim(),
    name: String(team.name || '').trim() || 'Unnamed team',
    division: team.division || 'Not provided',
    coach: team.coach || 'Unassigned',
  }));
  $: omittedTeamCount = sourceTeams.length - truthfulTeams.length;
</script>

{#if showEditTeam}
  <CreateTeamForm
    team={editingTeam}
    on:success={() => { showEditTeam = false; editingTeam = null; }}
    on:cancel={() => { showEditTeam = false; editingTeam = null; }}
  />
{/if}

{#if omittedTeamCount > 0}
  <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
    {omittedTeamCount} team {omittedTeamCount === 1 ? 'record was' : 'records were'} omitted because no stable team ID was provided.
  </p>
{/if}

<DataTable
  data={truthfulTeams}
  columns={[
    { key: 'name', label: 'Team Name' },
    { key: 'division', label: 'Division' },
    { key: 'coach', label: 'Coach' },
    { key: 'players', label: 'Players' },
    { key: 'actions', label: '', sortable: false, align: 'right' }
  ]}
  exportFilename="teams"
  searchPlaceholder="Search teams..."
  {loading}
  {error}
  {truncated}
>
  <svelte:fragment slot="actions">
    <button
      type="button"
      class="bg-[#1a56db] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1e40af] flex items-center"
      on:click={() => { editingTeam = null; showEditTeam = true; }}
    >
      + Create Team
    </button>
  </svelte:fragment>

  <svelte:fragment slot="cell" let:row let:column>
    {#if column.key === 'name'}
      <button
        type="button"
        class="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
        on:click={() => setActiveTeam(row)}
      >
        {row.name}
      </button>
    {:else if column.key === 'coach'}
      <span class="text-gray-900">{row.coach}</span>
    {:else if column.key === 'players'}
      <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full font-medium">
        {Number.isSafeInteger(row.memberCount) ? `${row.memberCount} Players` : 'Count unavailable'}
      </span>
    {:else if column.key === 'actions'}
      <button
        type="button"
        aria-label={`Edit ${row.name}`}
        class="text-gray-400 hover:text-[#1a56db]"
        on:click={() => { editingTeam = row; showEditTeam = true; }}
      >
        Edit
      </button>
    {:else}
      {row[column.key]}
    {/if}
  </svelte:fragment>
</DataTable>
