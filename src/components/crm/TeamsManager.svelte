<script lang="ts">
  import { tick } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
  } from '../../lib/api/BackendApi';
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
  let pendingDeleteTeam: any = null;
  let deleteState: 'idle' | 'loading' | 'error' = 'idle';
  let deleteError = '';
  let deleteOperationKey = '';

  function handleCreateClick() {
    isCreateFormOpen = true;
  }

  function requestDelete(team: any) {
    pendingDeleteTeam = team;
    deleteState = 'idle';
    deleteError = '';
    deleteOperationKey = createIdempotencyKey('team-delete');
  }

  function cancelDelete() {
    if (deleteState === 'loading') return;
    pendingDeleteTeam = null;
    deleteState = 'idle';
    deleteError = '';
    deleteOperationKey = '';
  }

  async function confirmDelete() {
    if (!pendingDeleteTeam || deleteState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      deleteState = 'error';
      deleteError = 'Select an organization before deleting a team.';
      return;
    }
    const teamId = String(pendingDeleteTeam.id || '').trim();
    const teamName = String(pendingDeleteTeam.name || 'team').trim();
    if (!teamId) return;
    deleteState = 'loading';
    deleteError = '';
    try {
      await backendClient.deleteTeam(
        tenantId,
        teamId,
        `Delete ${teamName} and archive its linked team content.`,
        deleteOperationKey || createIdempotencyKey('team-delete'),
      );
      pendingDeleteTeam = null;
      deleteState = 'idle';
      deleteOperationKey = '';
    } catch (error) {
      const supportId = error instanceof BackendApiError
        ? error.requestId
        : null;
      console.error(
        'Team deletion failed.',
        supportId ? { requestId: supportId } : {},
      );
      deleteState = 'error';
      deleteError = `The team could not be deleted.${supportId ? ` Support request: ${supportId}` : ''}`;
    }
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

{#if pendingDeleteTeam}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
    <button
      type="button"
      class="fixed inset-0 z-0 h-full w-full bg-gray-500 bg-opacity-75"
      aria-label="Cancel team deletion"
      disabled={deleteState === 'loading'}
      on:click={cancelDelete}
    ></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="relative z-10 inline-block w-full max-w-md overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle">
      <div class="px-6 pb-4 pt-5">
        <h3 id="delete-team-title" class="text-lg font-semibold text-gray-900">Delete {pendingDeleteTeam.name}?</h3>
        <p class="mt-2 text-sm text-gray-600">
          This removes the team page and navigation entry, archives linked events and messages, and keeps historical season records intact.
        </p>
        {#if deleteError}
          <p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{deleteError}</p>
        {/if}
      </div>
      <div class="flex flex-col-reverse gap-3 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
          disabled={deleteState === 'loading'}
          on:click={cancelDelete}
        >Cancel</button>
        <button
          type="button"
          class="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-50"
          disabled={deleteState === 'loading'}
          on:click={confirmDelete}
        >{deleteState === 'loading' ? 'Deleting…' : deleteState === 'error' ? 'Retry Delete' : 'Delete Team'}</button>
      </div>
    </div>
  </div>
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
    <div class="space-y-4 max-w-5xl mx-auto">
      {#each $teamsStore as team (team.id)}
        <div
          data-record-id={team.id}
          class="w-full border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow bg-white group flex items-start gap-4 {activeResultId === String(team.id) ? 'ring-2 ring-blue-500' : ''}"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-start justify-between gap-4 text-left"
            on:click={() => setActiveTeam(team)}
          >
            <div>
              <h3 class="text-xl font-semibold text-[#1a56db] group-hover:text-[#1e40af] transition-colors">{team.name}</h3>
              {#if team.description}
                <p class="mt-2 text-sm text-gray-500 max-w-3xl">{team.description}</p>
              {/if}
            </div>
            <span class="whitespace-nowrap text-sm font-medium text-[#1a56db]">Open team</span>
          </button>
          <button
            type="button"
            class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            aria-label={`Delete ${team.name}`}
            on:click={() => requestDelete(team)}
          >Delete</button>
        </div>
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
