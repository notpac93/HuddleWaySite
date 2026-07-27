<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { RosterService } from '../../../lib/services/RosterService';
  import {
    teamsProjectionScope,
    teamsStore,
  } from '../../../lib/services/DataStore';
  import PlayerTable from './PlayerTable.svelte';
  import TeamTable from './TeamTable.svelte';
  import ImportCsv from './ImportCsv.svelte';

  export let activeTeam: string | { id?: unknown } | null = null;
  export let setActiveTeam = () => {};
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};

  let rawData: any[] = [];
  let unsubscribePlayers = () => {};
  let playerSubscriptionGeneration = 0;
  let playersLoading = true;
  let playersError = '';
  let playersRequestId = '';
  let playersTruncated = {
    registrations: false,
    memberships: false,
    teams: false,
  };

  let activeTab = 'Players'; // 'Players', 'Teams', 'Import'

  $: if (activeResultId) activeTab = 'Players';
  $: activeTeamId =
    typeof activeTeam === 'object' && activeTeam
      ? String(activeTeam.id || '').trim()
      : String(activeTeam || '').trim();
  $: projectedTeams = (Array.isArray($teamsStore) ? $teamsStore : [])
    .filter((team) => String(team?.id || '').trim());
  $: teams = activeTeamId
    ? projectedTeams.filter(
        (team) => String(team.parentTeamId || '').trim() === activeTeamId,
      )
    : projectedTeams;

  function subscribePlayers() {
    const generation = ++playerSubscriptionGeneration;
    unsubscribePlayers();
    const tenantId = $tenantIdStore;
    rawData = [];
    playersError = '';
    playersRequestId = '';
    playersTruncated = {
      registrations: false,
      memberships: false,
      teams: false,
    };
    if (!tenantId) {
      rawData = [];
      playersLoading = false;
      return;
    }
    playersLoading = true;
    unsubscribePlayers = RosterService.subscribeToPlayers(
      tenantId,
      activeTeam,
      (players, scope) => {
        if (
          generation !== playerSubscriptionGeneration
          || $tenantIdStore !== tenantId
        ) return;
        rawData = Array.isArray(players) ? players : [];
        playersTruncated = scope.truncated;
        playersRequestId = scope.requestId;
        playersLoading = false;
      },
      (error) => {
        if (
          generation !== playerSubscriptionGeneration
          || $tenantIdStore !== tenantId
        ) return;
        playersRequestId = String(
          (error as { requestId?: unknown })?.requestId || '',
        ).trim();
        playersError = 'Roster players could not be loaded. Check your connection and try again.';
        playersLoading = false;
      },
    );
  }

  function refreshPlayers() {
    subscribePlayers();
  }

  $: {
    $tenantIdStore;
    activeTeam;
    subscribePlayers();
  }

  onDestroy(() => {
    playerSubscriptionGeneration += 1;
    unsubscribePlayers();
  });
</script>

<div class="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-white">
  <div class="flex justify-between items-center">
    <div>
      <h2 class="crm-ui-page-title">Rosters & Teams</h2>
      <p class="text-sm text-gray-500">Manage teams and reviewed player assignments.</p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="border-b border-gray-200">
    <nav class="-mb-px flex space-x-8" aria-label="Roster views">
      <button
        type="button"
        aria-pressed={activeTab === 'Players'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Players' ? 'border-[#1a56db] text-[#1a56db]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        on:click={() => activeTab = 'Players'}
      >
        All Players
      </button>
      <button
        type="button"
        aria-pressed={activeTab === 'Teams'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Teams' ? 'border-[#1a56db] text-[#1a56db]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        on:click={() => activeTab = 'Teams'}
      >
        Teams & Divisions
      </button>
      <button
        type="button"
        aria-pressed={activeTab === 'Import'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Import' ? 'border-[#1a56db] text-[#1a56db]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        on:click={() => activeTab = 'Import'}
      >
        CSV Import
      </button>
    </nav>
  </div>

  {#if activeTab === 'Players'}
    <PlayerTable
      players={rawData}
      allTeams={$teamsStore}
      loading={playersLoading}
      error={playersError}
      truncated={Object.values(playersTruncated).some(Boolean)}
      requestId={playersRequestId}
      {setActiveTeam}
      {activeResultId}
      {onTargetConsumed}
      on:changed={refreshPlayers}
    />
  {:else if activeTab === 'Teams'}
    <TeamTable
      {teams}
      loading={$teamsProjectionScope.loading}
      error={$teamsProjectionScope.error}
      truncated={$teamsProjectionScope.truncated}
      {setActiveTeam}
    />
  {:else if activeTab === 'Import'}
    <ImportCsv {activeTeam} teams={$teamsStore} />
  {/if}
</div>
