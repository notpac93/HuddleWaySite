<script lang="ts">
  import CreateTeamForm from '../teams/CreateTeamForm.svelte';

  export let teams = [];
  export let parentTeam = null;
  export let setActiveTeam = () => {};
  export let loading = false;
  export let error = '';

  let showEditTeam = false;
  let editingTeam = null;
  let searchTerm = '';

  $: sourceTeams = Array.isArray(teams) ? teams : [];
  $: truthfulTeams = sourceTeams
    .filter((team) => String(team?.id || '').trim())
    .map((team) => ({
      ...team,
      id: String(team.id).trim(),
      name: String(team.name || '').trim() || 'Unnamed team',
      description: String(team.description || '').trim(),
      status: String(team.status || 'active').trim(),
      memberCount: Number.isSafeInteger(Number(team.memberCount))
        ? Number(team.memberCount)
        : 0,
    }));
  $: omittedTeamCount = sourceTeams.length - truthfulTeams.length;
  $: normalizedSearch = searchTerm.trim().toLowerCase();
  $: visibleTeams = truthfulTeams.filter((team) =>
    !normalizedSearch
    || `${team.name} ${team.description} ${team.status}`
      .toLowerCase()
      .includes(normalizedSearch)
  );
  $: parentTeamName = String(parentTeam?.name || '').trim();

  function openCreate() {
    editingTeam = null;
    showEditTeam = true;
  }

  function openEdit(team) {
    editingTeam = team;
    showEditTeam = true;
  }

  function closeForm() {
    showEditTeam = false;
    editingTeam = null;
  }
</script>

{#if showEditTeam}
  <CreateTeamForm
    team={editingTeam}
    {parentTeam}
    on:success={closeForm}
    on:cancel={closeForm}
  />
{/if}

<section aria-labelledby="teams-divisions-heading" class="space-y-5">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h3 id="teams-divisions-heading" class="text-lg font-semibold text-gray-950">
        {parentTeamName ? `${parentTeamName} teams` : 'Teams & Divisions'}
      </h3>
      <p class="mt-1 text-sm text-gray-500">
        {parentTeamName
          ? `Create and manage teams within ${parentTeamName}.`
          : 'Create and manage organization teams.'}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-md bg-[#1a56db] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1e40af]"
      on:click={openCreate}
    >
      + Create Team
    </button>
  </div>

  <label class="block max-w-sm">
    <span class="sr-only">Search teams</span>
    <input
      type="search"
      bind:value={searchTerm}
      class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#1a56db] focus:outline-none focus:ring-1 focus:ring-[#1a56db]"
      placeholder="Search teams..."
    />
  </label>

  {#if omittedTeamCount > 0}
    <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
      {omittedTeamCount} team {omittedTeamCount === 1 ? 'record was' : 'records were'} omitted because no stable team ID was provided.
    </p>
  {/if}

  {#if loading}
    <div class="rounded-lg border border-gray-200 p-12 text-center text-sm text-gray-600" role="status">Loading teams…</div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800" role="alert">{error}</div>
  {:else if visibleTeams.length > 0}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each visibleTeams as team (team.id)}
        <article class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wide text-[#1a56db]">
                {parentTeamName || 'Organization'}
              </p>
              <h4 class="mt-1 truncate text-lg font-semibold text-gray-950">{team.name}</h4>
            </div>
            <span class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium capitalize text-green-800">{team.status}</span>
          </div>
          <p class="mt-3 min-h-[2.5rem] text-sm text-gray-600">
            {team.description || 'No description added.'}
          </p>
          <dl class="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
            <div>
              <dt class="text-xs text-gray-500">Players</dt>
              <dd class="mt-1 text-sm font-semibold text-gray-900">{team.memberCount}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500">Division</dt>
              <dd class="mt-1 truncate text-sm font-semibold text-gray-900">{parentTeamName || 'Program-wide'}</dd>
            </div>
          </dl>
          <div class="mt-5 flex items-center justify-between gap-3">
            <button type="button" class="text-sm font-medium text-gray-600 hover:text-[#1a56db]" on:click={() => openEdit(team)}>Edit</button>
            <button type="button" class="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-[#1a56db] hover:bg-blue-100" on:click={() => setActiveTeam(team)}>Open team</button>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <div class="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center">
      <h4 class="text-sm font-semibold text-gray-900">
        {normalizedSearch ? 'No matching teams' : 'No teams yet'}
      </h4>
      <p class="mt-1 text-sm text-gray-500">
        {normalizedSearch
          ? 'Try a different search.'
          : parentTeamName
            ? `Create the first team within ${parentTeamName}.`
            : 'Create the first team for this organization.'}
      </p>
      {#if !normalizedSearch}
        <button type="button" class="mt-5 rounded-md bg-[#1a56db] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e40af]" on:click={openCreate}>Create Team</button>
      {/if}
    </div>
  {/if}
</section>
