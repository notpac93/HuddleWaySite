<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { RosterService } from '../../../lib/services/RosterService';
  import {
    seasonsStore,
    teamsProjectionScope,
    teamsStore,
  } from '../../../lib/services/DataStore';
  import PlayerTable from './PlayerTable.svelte';
  import TeamTable from './TeamTable.svelte';
  import ImportCsv from './ImportCsv.svelte';
  import RosterParticipantEntry from './RosterParticipantEntry.svelte';

  export let activeTeam: string | { id?: unknown } | null = null;
  export let setActiveTeam = () => {};
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};

  let rawData: any[] = [];
  let unsubscribePlayers = () => {};
  let playerSubscriptionGeneration = 0;
  let playersLoading = true;
  let playersError = '';
  let playersTruncated = {
    registrations: false,
    privateRegistrations: false,
    memberships: false,
    teams: false,
  };

  let activeTab = 'Players'; // 'Players', 'Teams', 'Import'
  let entryMode: 'manual' | 'csv' | null = null;
  let entrySuccess = '';

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
    playersTruncated = {
      registrations: false,
      privateRegistrations: false,
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
        playersLoading = false;
      },
      (error) => {
        if (
          generation !== playerSubscriptionGeneration
          || $tenantIdStore !== tenantId
        ) return;
        playersError = 'Roster players could not be loaded. Check your connection and try again.';
        playersLoading = false;
      },
    );
  }

  function refreshPlayers() {
    subscribePlayers();
  }

  function handleEntrySuccess(event) {
    const savedCount = Number(event.detail?.savedCount || 0);
    entrySuccess = `${savedCount} ${savedCount === 1 ? 'person was' : 'people were'} added to the program.`;
    entryMode = null;
    refreshPlayers();
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

{#if entryMode}
  <RosterParticipantEntry
    tenantId={$tenantIdStore || ''}
    teams={$teamsStore}
    seasons={$seasonsStore}
    initialMode={entryMode}
    on:success={handleEntrySuccess}
    on:cancel={() => entryMode = null}
  />
{/if}

<div class="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-white">
  <div class="flex justify-between items-center">
    <div>
      <h2 class="crm-ui-page-title">Rosters & Teams</h2>
      <p class="text-sm text-gray-500">Manage program members, teams, seasons, and reviewed player assignments.</p>
    </div>
    <button type="button" class="rounded bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)]" on:click={() => { entrySuccess = ''; entryMode = 'csv'; }}>Import players CSV</button>
  </div>
  {#if entrySuccess}<p class="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{entrySuccess}</p>{/if}

  <!-- Tabs -->
  <div class="border-b border-gray-200">
    <nav class="-mb-px flex space-x-8" aria-label="Roster views">
      <button
        type="button"
        aria-pressed={activeTab === 'Players'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Players' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        on:click={() => activeTab = 'Players'}
      >
        All Players
      </button>
      <button
        type="button"
        aria-pressed={activeTab === 'Teams'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Teams' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
        on:click={() => activeTab = 'Teams'}
      >
        Teams & Divisions
      </button>
      <button
        type="button"
        aria-pressed={activeTab === 'Import'}
        class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {activeTab === 'Import' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500 hover:text-gray-700'}"
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
      allSeasons={$seasonsStore}
      loading={playersLoading}
      error={playersError}
      truncated={Object.values(playersTruncated).some(Boolean)}
      {setActiveTeam}
      {activeResultId}
      {onTargetConsumed}
      onAddPlayer={() => { entrySuccess = ''; entryMode = 'manual'; }}
      on:changed={refreshPlayers}
    />
  {:else if activeTab === 'Teams'}
    <TeamTable
      {teams}
      parentTeam={typeof activeTeam === 'object' ? activeTeam : null}
      loading={$teamsProjectionScope.loading}
      error={$teamsProjectionScope.error}
      {setActiveTeam}
    />
  {:else if activeTab === 'Import'}
    <ImportCsv {activeTeam} teams={$teamsStore} />
  {/if}
</div>
