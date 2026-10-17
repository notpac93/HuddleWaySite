<script lang="ts">
  import { onDestroy } from 'svelte';
  import { programTermsStore } from '../../../lib/crm/programVocabulary';
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
  $: teamsWithRosterCounts = teams.map((team) => {
    const teamId = String(team?.id || '').trim();
    const projectedCount = rawData.filter(
      (player) => String(player?.teamId || '').trim() === teamId,
    ).length;
    return {
      ...team,
      memberCount: !playersLoading
        && !playersError
        && !Object.values(playersTruncated).some(Boolean)
        ? projectedCount
        : Number.isSafeInteger(Number(team?.memberCount))
          ? Number(team.memberCount)
          : 0,
    };
  });

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
      <h2 class="crm-ui-page-title">{$programTermsStore.people}</h2>
    </div>
  </div>
  {#if entrySuccess}<p class="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{entrySuccess}</p>{/if}

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
      onImportPlayers={() => { entrySuccess = ''; entryMode = 'csv'; }}
      on:changed={refreshPlayers}
    >
      <select slot="view" aria-label="Roster view" bind:value={activeTab}><option value="Players">{$programTermsStore.people}</option><option value="Teams">{$programTermsStore.groups}</option><option value="Import">Bulk updates</option></select>
    </PlayerTable>
  {:else if activeTab === 'Teams'}
    <TeamTable
      teams={teamsWithRosterCounts}
      parentTeam={typeof activeTeam === 'object' ? activeTeam : null}
      loading={$teamsProjectionScope.loading}
      error={$teamsProjectionScope.error}
      {setActiveTeam}
    >
      <select slot="view" aria-label="Roster view" bind:value={activeTab}><option value="Players">{$programTermsStore.people}</option><option value="Teams">{$programTermsStore.groups}</option><option value="Import">Bulk updates</option></select>
    </TeamTable>
  {:else if activeTab === 'Import'}
    <select aria-label="Roster view" bind:value={activeTab}><option value="Players">{$programTermsStore.people}</option><option value="Teams">{$programTermsStore.groups}</option><option value="Import">Bulk updates</option></select>
    <ImportCsv {activeTeam} teams={$teamsStore} />
  {/if}
</div>
