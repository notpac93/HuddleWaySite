<script lang="ts">
  import { tick } from 'svelte';
  import {
    teamsProjectionScope,
    teamsStore,
  } from '../../lib/services/DataStore';
  import CreateTeamForm from './teams/CreateTeamForm.svelte';

  export let setActiveTeam = () => {};
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};

  let isCreateFormOpen = false;
  let consumedTargetId = '';

  function handleCreateClick() {
    isCreateFormOpen = true;
  }

  $: if (activeResultId && activeResultId !== consumedTargetId) {
    const targetTeam = $teamsStore.find((team) => String(team.id) === activeResultId);
    if (targetTeam) {
      consumedTargetId = activeResultId;
      void tick().then(() => {
        const consumedId = activeResultId;
        if (!consumedId) return;
        onTargetConsumed(consumedId);
        setActiveTeam(targetTeam);
      });
    }
  }
  $: if (!activeResultId) consumedTargetId = '';
</script>

{#if isCreateFormOpen}
  <CreateTeamForm
    on:cancel={() => isCreateFormOpen = false}
    on:success={() => isCreateFormOpen = false}
  />
{/if}

<div class="h-full overflow-y-auto bg-white p-4 sm:p-8">
  <div class="flex justify-between items-center mb-8 max-w-5xl mx-auto">
    <h2 class="text-3xl font-extrabold text-gray-900 tracking-tight">Teams</h2>
    <div class="flex space-x-3">
        <button type="button" on:click={handleCreateClick} class="bg-[#1a56db] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1e40af] flex items-center shadow-sm">
          <svg class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Team
        </button>
      </div>
    </div>

    {#if $teamsProjectionScope.loading}
      <div class="mx-auto max-w-5xl rounded-lg border border-gray-200 p-12 text-center text-sm text-gray-600" role="status">Loading teams…</div>
    {:else if $teamsProjectionScope.error}
      <div class="mx-auto max-w-5xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800" role="alert">
        {$teamsProjectionScope.error}
      </div>
    {:else}
    {#if $teamsProjectionScope.truncated}
      <p class="mx-auto mb-4 max-w-5xl rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        Showing the first {$teamsProjectionScope.limit} teams by record ID. More teams exist.
      </p>
    {/if}
    <div class="space-y-4 max-w-5xl mx-auto">
      {#each $teamsStore as team (team.id)}
        <button
          type="button"
          data-record-id={team.id}
          class="w-full border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow bg-white group flex justify-between items-start text-left {activeResultId === String(team.id) ? 'ring-2 ring-blue-500' : ''}"
          on:click={() => setActiveTeam(team)}
        >
          <div>
            <h3 class="text-xl font-semibold text-[#1a56db] group-hover:text-[#1e40af] transition-colors">{team.name}</h3>
            {#if team.description}
              <p class="mt-2 text-sm text-gray-500 max-w-3xl">{team.description}</p>
            {/if}
          </div>
          <span class="text-sm font-medium text-[#1a56db]">Open team</span>
        </button>
      {/each}

      {#if $teamsStore.length === 0}
        <div class="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 class="mt-2 text-sm font-semibold text-gray-900">No teams</h3>
          <p class="mt-1 text-sm text-gray-500">Get started by creating a new team.</p>
          <div class="mt-6">
            <button type="button" on:click={handleCreateClick} class="inline-flex items-center rounded-md bg-[#1a56db] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1e40af] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a56db]">
              <svg class="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Create Team
            </button>
          </div>
        </div>
      {/if}
  </div>
  {/if}
</div>
