<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import type { PortalIconName } from '../../lib/ui/portalIcons';
  import {
    eventsStore,
    registrationsProjectionScope,
    registrationsStore,
    seasonsStore,
    teamsProjectionScope,
    teamsStore,
    refreshOperationalCollections,
  } from '../../lib/services/DataStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import { RosterService } from '../../lib/services/RosterService';
  import CreateTeamForm from './teams/CreateTeamForm.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import LoadingState from './ui/LoadingState.svelte';
  import PageHeader from './ui/PageHeader.svelte';
  import StatusNotice from './ui/StatusNotice.svelte';
  import ChangeReceipt from './ui/ChangeReceipt.svelte';

  export let setActiveTeam: (team: any) => void = () => {};
  export let activeTeam: any = null;
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};
  export let onNavigateTab: (tab: string) => void = () => {};

  type Workspace = { tab: string; icon: PortalIconName; label: string; detail: string };
  const teamWorkspaces: Workspace[] = [
    { tab: 'Roster', icon: 'roster', label: 'Manage roster', detail: 'Add, import, and review participants.' },
    { tab: 'Seasons', icon: 'seasons', label: 'Manage seasons', detail: 'Review the team’s season relationships.' },
    { tab: 'Events', icon: 'events', label: 'Manage events', detail: 'Schedule and publish team events.' },
    { tab: 'Financials', icon: 'financials', label: 'Review financials', detail: 'Inspect team-related financial activity.' },
  ];

  let isTeamFormOpen = false;
  let editingTeam: any = null;
  let consumedTargetId = '';
  let pendingDeleteTeam: any = null;
  let deleteState: 'idle' | 'loading' | 'error' = 'idle';
  let deleteError = '';
  let deleteReason = '';
  let deleteConfirmation = '';
  let deleteOperationKey = '';
  let teamReceipt: {
    title: string;
    message: string;
    reference?: string;
  } | null = null;
  let rosterPlayers: any[] = [];
  let rosterCountScopeComplete = false;
  let unsubscribeRosterCounts = () => {};
  let rosterCountGeneration = 0;

  function subscribeRosterCounts() {
    const generation = ++rosterCountGeneration;
    unsubscribeRosterCounts();
    const tenantId = $tenantIdStore;
    rosterPlayers = [];
    rosterCountScopeComplete = false;
    if (!tenantId) return;
    unsubscribeRosterCounts = RosterService.subscribeToPlayers(
      tenantId,
      null,
      (players, scope) => {
        if (generation !== rosterCountGeneration || $tenantIdStore !== tenantId) return;
        rosterPlayers = Array.isArray(players) ? players : [];
        rosterCountScopeComplete = !Object.values(scope.truncated).some(Boolean);
      },
      () => {
        if (generation !== rosterCountGeneration || $tenantIdStore !== tenantId) return;
        rosterCountScopeComplete = false;
      },
    );
  }

  $: {
    $tenantIdStore;
    subscribeRosterCounts();
  }

  function referencesTeam(record: any, teamId: string) {
    return [record?.teamId, record?.team?.id, record?.metadata?.teamId]
      .some((value) => String(value || '').trim() === teamId);
  }

  function teamRosterCount(team: any) {
    const teamId = String(team?.id || '').trim();
    const teamName = String(team?.name || team?.title || '').trim().toLowerCase();
    if (rosterCountScopeComplete) {
      return rosterPlayers.filter((player) =>
        String(player?.teamId || '').trim() === teamId
        || (Array.isArray(player?.teamIds)
          && player.teamIds.some((id) => String(id || '').trim() === teamId))
        || (teamName
          && String(player?.team || '')
            .split(',')
            .some((name) => name.trim().toLowerCase() === teamName)),
      ).length;
    }
    const explicit = Number(team?.memberCount ?? team?.playerCount);
    const projected = $registrationsStore.filter(
      (record) => referencesTeam(record, String(team?.id || '')),
    ).length;
    return !$registrationsProjectionScope.loading
      && !$registrationsProjectionScope.error
      && !$registrationsProjectionScope.truncated
      ? projected
      : Number.isSafeInteger(explicit) && explicit >= 0
        ? explicit
        : 0;
  }

  onDestroy(() => {
    rosterCountGeneration += 1;
    unsubscribeRosterCounts();
  });

  function teamSeasons(team: any) {
    return $seasonsStore.filter((record) => referencesTeam(record, String(team?.id || '')));
  }

  function activeSeasonName(team: any) {
    const seasons = teamSeasons(team);
    const active = seasons.find((season) => ['active', 'open', 'upcoming'].includes(String(season?.status || '').toLowerCase())) || seasons[0];
    return String(active?.name || active?.title || '').trim() || 'No season connected';
  }

  function teamStatus(team: any) {
    const status = String(team?.status || team?.lifecycleStatus || 'active').trim().toLowerCase();
    return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'Active';
  }

  function eventDate(event: any) {
    const value = event?.startAt || event?.date || event?.startDate;
    if (value?.toDate) return value.toDate();
    const parsed = new Date(value || 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function upcomingTeamEventCount(team: any) {
    const now = Date.now();
    return $eventsStore.filter((event) => {
      const date = eventDate(event);
      return referencesTeam(event, String(team?.id || ''))
        && !['archived', 'cancelled', 'deleted'].includes(String(event?.status || event?.lifecycleStatus || '').toLowerCase())
        && Boolean(date && date.getTime() >= now);
    }).length;
  }

  function openCreateForm() {
    editingTeam = null;
    isTeamFormOpen = true;
  }

  function openEditForm(team: any) {
    editingTeam = team;
    isTeamFormOpen = true;
  }

  function closeTeamForm() {
    editingTeam = null;
    isTeamFormOpen = false;
  }

  function handleTeamSuccess(event: CustomEvent<{ action: string; name: string }>) {
    const action = event.detail?.action === 'updated' ? 'updated' : 'created';
    const name = event.detail?.name || 'Team';
    teamReceipt = {
      title: action === 'updated' ? 'Team updated' : 'Team created',
      message: `${name} was ${action} and the team list was refreshed.`,
    };
    closeTeamForm();
  }

  function requestDelete(team: any) {
    pendingDeleteTeam = team;
    deleteState = 'idle';
    deleteError = '';
    deleteReason = '';
    deleteConfirmation = '';
    deleteOperationKey = createIdempotencyKey('team-delete');
  }

  function cancelDelete() {
    if (deleteState === 'loading') return;
    pendingDeleteTeam = null;
    deleteState = 'idle';
    deleteError = '';
    deleteReason = '';
    deleteConfirmation = '';
    deleteOperationKey = '';
  }

  async function confirmDelete() {
    if (!pendingDeleteTeam || deleteState === 'loading') return;
    const tenantId = $tenantIdStore;
    const teamId = String(pendingDeleteTeam.id || '').trim();
    const teamName = String(pendingDeleteTeam.name || 'team').trim();
    if (!tenantId) {
      deleteState = 'error';
      deleteError = 'Select an organization before deleting a team.';
      return;
    }
    if (!teamId || deleteConfirmation.trim() !== teamName || !deleteReason.trim()) return;
    deleteState = 'loading';
    deleteError = '';
    try {
      await backendClient.deleteTeam(
        tenantId,
        teamId,
        deleteReason.trim(),
        deleteOperationKey || createIdempotencyKey('team-delete'),
      );
      if (String(activeTeam?.id || '') === teamId) setActiveTeam(null);
      refreshOperationalCollections('teams', 'events', 'seasons');
      teamReceipt = {
        title: 'Team deleted',
        message: `${teamName} was deleted and linked portal lists are refreshing.`,
        reference: deleteOperationKey,
      };
      deleteState = 'idle';
      cancelDelete();
    } catch (error) {
      const supportId = error instanceof BackendApiError ? error.requestId : null;
      console.error('Team deletion failed.', supportId ? { requestId: supportId } : {});
      deleteState = 'error';
      deleteError = supportId
        ? `The team could not be deleted. Support reference: ${supportId}`
        : 'The team could not be deleted. Review the details and try again.';
    }
  }

  $: if (activeTeam?.id) {
    const currentTeam = $teamsStore.find((team) => String(team.id) === String(activeTeam.id));
    if (currentTeam && currentTeam !== activeTeam) setActiveTeam(currentTeam);
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

{#if isTeamFormOpen}
  <CreateTeamForm team={editingTeam} on:cancel={closeTeamForm} on:success={handleTeamSuccess} />
{/if}

{#if pendingDeleteTeam}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
    <button type="button" class="crm-ui-backdrop" aria-label="Cancel team deletion" tabindex="-1" disabled={deleteState === 'loading'} on:click={cancelDelete}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="relative z-10 inline-block w-full max-w-md overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: cancelDelete }}>
      <div class="px-6 pb-4 pt-5">
        <h3 id="delete-team-title" class="text-lg font-semibold text-gray-900">Delete {pendingDeleteTeam.name}?</h3>
        <p class="mt-2 text-sm text-gray-600">Permanent deletion is intended for teams created in error. The team page will be removed, linked events and messages will be archived, and seasons will be detached while their history remains.</p>
        <div class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Loaded impact:</strong> {teamRosterCount(pendingDeleteTeam)} roster record{teamRosterCount(pendingDeleteTeam) === 1 ? '' : 's'}, {teamSeasons(pendingDeleteTeam).length} season{teamSeasons(pendingDeleteTeam).length === 1 ? '' : 's'}, and {$eventsStore.filter((event) => referencesTeam(event, String(pendingDeleteTeam.id || ''))).length} event{ $eventsStore.filter((event) => referencesTeam(event, String(pendingDeleteTeam.id || ''))).length === 1 ? '' : 's'} reference this team. The server rechecks all tenant records at deletion time.
        </div>
        <label for="team-delete-reason" class="crm-ui-label mt-4">Audit reason</label>
        <textarea id="team-delete-reason" bind:value={deleteReason} rows="2" disabled={deleteState === 'loading'} class="crm-ui-input mt-1" placeholder="Why is this team being deleted?"></textarea>
        <label for="team-delete-confirm" class="crm-ui-label mt-4">Type {pendingDeleteTeam.name} to confirm</label>
        <input id="team-delete-confirm" bind:value={deleteConfirmation} disabled={deleteState === 'loading'} class="crm-ui-input mt-1" autocomplete="off" />
        {#if deleteError}<p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{deleteError}</p>{/if}
      </div>
      <div class="flex flex-col-reverse gap-3 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
        <button type="button" class="crm-ui-button-secondary" disabled={deleteState === 'loading'} on:click={cancelDelete}>Cancel</button>
        <button type="button" class="crm-ui-button-danger-outline bg-red-600 text-white hover:bg-red-700" aria-label="Permanently delete team" disabled={deleteState === 'loading' || !deleteReason.trim() || deleteConfirmation.trim() !== String(pendingDeleteTeam.name || '').trim()} on:click={confirmDelete}>
          {deleteState === 'loading' ? 'Deleting…' : deleteState === 'error' ? 'Retry delete' : 'Delete team'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="h-full overflow-y-auto bg-white p-4 sm:p-8">
  <div class="mx-auto max-w-5xl">
    {#if teamReceipt}
      <div class="mb-6">
        <ChangeReceipt
          status="success"
          title={teamReceipt.title}
          message={teamReceipt.message}
          reference={teamReceipt.reference}
          onDismiss={() => teamReceipt = null}
        />
      </div>
    {/if}
    {#if activeTeam}
      <PageHeader eyebrow="Selected team" title={activeTeam.name || 'Team overview'} support={activeTeam.description || 'Review this team and continue into a team-aware workspace.'}>
        <div slot="actions" class="flex flex-wrap gap-2">
          <button type="button" class="crm-ui-button-secondary inline-flex items-center gap-2" on:click={() => openEditForm(activeTeam)}><Icon name="pencil" size={16} /> Edit team</button>
          <button type="button" class="crm-ui-button-danger-outline inline-flex items-center gap-2" on:click={() => requestDelete(activeTeam)}><Icon name="trash" size={16} /> Delete team</button>
        </div>
      </PageHeader>
      <div class="mt-6">
        <StatusNotice tone="info" title={`${activeTeam.name || 'This team'} is your working context`} message="Team-aware pages open filtered to this team. Choose All teams in the scope bar to return to organization-wide work." />
      </div>
      <section class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Team overview">
        <div class="rounded-lg border bg-white p-4"><p class="text-xs font-semibold uppercase text-gray-500">Status</p><p class="mt-1 text-lg font-semibold">{teamStatus(activeTeam)}</p></div>
        <button type="button" class="rounded-lg border bg-white p-4 text-left hover:border-[var(--crm-brand-focus)]" on:click={() => onNavigateTab('Roster')}><span class="text-xs font-semibold uppercase text-gray-500">Roster</span><span class="mt-1 block text-lg font-semibold">{teamRosterCount(activeTeam)} people</span></button>
        <button type="button" class="rounded-lg border bg-white p-4 text-left hover:border-[var(--crm-brand-focus)]" on:click={() => onNavigateTab('Seasons')}><span class="text-xs font-semibold uppercase text-gray-500">Active season</span><span class="mt-1 block text-lg font-semibold">{activeSeasonName(activeTeam)}</span></button>
        <button type="button" class="rounded-lg border bg-white p-4 text-left hover:border-[var(--crm-brand-focus)]" on:click={() => onNavigateTab('Events')}><span class="text-xs font-semibold uppercase text-gray-500">Upcoming events</span><span class="mt-1 block text-lg font-semibold">{upcomingTeamEventCount(activeTeam)}</span></button>
      </section>
      <section class="mt-6" aria-labelledby="team-workspaces-title">
        <h3 id="team-workspaces-title" class="text-base font-semibold text-gray-900">Team workspaces</h3>
        <p class="mt-1 text-sm text-gray-600">Continue with the most common team management tasks.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each teamWorkspaces as workspace}
            <button type="button" class="portal-motion-color rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-[var(--crm-brand-focus)] hover:bg-[var(--crm-brand-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--crm-brand-focus)]" on:click={() => onNavigateTab(workspace.tab)}>
              <span class="flex items-center gap-2 font-semibold text-gray-900"><Icon name={workspace.icon} size={18} className="text-[var(--crm-brand-link)]" /> {workspace.label}</span>
              <span class="mt-2 block text-sm text-gray-600">{workspace.detail}</span>
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <PageHeader eyebrow="Organization" title="Teams" support="Create teams, update team details, or select a team as your working context.">
        <button slot="actions" type="button" on:click={openCreateForm} class="crm-ui-button-primary inline-flex items-center gap-2"><Icon name="plus" size={16} /> Create team</button>
      </PageHeader>
      <div class="mt-6">
        {#if $teamsProjectionScope.loading}
          <LoadingState label="Loading teams…" />
        {:else if $teamsProjectionScope.error}
          <StatusNotice tone="danger" title="Teams could not be loaded" message={$teamsProjectionScope.error} />
        {:else if $teamsStore.length === 0}
          <EmptyState icon="teams" title="No teams yet" message="Create the first team to organize rosters, seasons, and events." primaryLabel="Create team" onPrimary={openCreateForm} />
        {:else}
          <div class="space-y-4">
            {#each $teamsStore as team (team.id)}
              <article data-record-id={team.id} class="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-5 {activeResultId === String(team.id) ? 'ring-2 ring-[var(--crm-brand-focus)]' : ''}">
                <button type="button" class="min-w-0 flex-1 text-left" on:click={() => setActiveTeam(team)}>
                  <span class="flex items-center justify-between gap-4"><span class="text-lg font-semibold text-[var(--crm-brand-link)]">{team.name}</span><span class="whitespace-nowrap text-sm font-semibold text-[var(--crm-brand-link)]">Open team</span></span>
                  <span class="mt-2 block text-sm text-gray-600">{team.description || 'No description provided.'}</span>
                  <span class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>{teamStatus(team)}</span><span>{teamRosterCount(team)} people</span><span>{activeSeasonName(team)}</span></span>
                </button>
                <button type="button" class="crm-ui-button-secondary inline-flex items-center gap-2" aria-label={`Edit ${team.name}`} on:click={() => openEditForm(team)}><Icon name="pencil" size={16} /> Edit</button>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
