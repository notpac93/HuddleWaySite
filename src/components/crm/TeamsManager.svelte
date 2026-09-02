<script lang="ts">
  import { tick } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import type { PortalIconName } from '../../lib/ui/portalIcons';
  import { teamsProjectionScope, teamsStore } from '../../lib/services/DataStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import CreateTeamForm from './teams/CreateTeamForm.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import LoadingState from './ui/LoadingState.svelte';
  import PageHeader from './ui/PageHeader.svelte';
  import StatusNotice from './ui/StatusNotice.svelte';

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
  <CreateTeamForm team={editingTeam} on:cancel={closeTeamForm} on:success={closeTeamForm} />
{/if}

{#if pendingDeleteTeam}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
    <button type="button" class="crm-ui-backdrop" aria-label="Cancel team deletion" tabindex="-1" disabled={deleteState === 'loading'} on:click={cancelDelete}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="relative z-10 inline-block w-full max-w-md overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: cancelDelete }}>
      <div class="px-6 pb-4 pt-5">
        <h3 id="delete-team-title" class="text-lg font-semibold text-gray-900">Delete {pendingDeleteTeam.name}?</h3>
        <p class="mt-2 text-sm text-gray-600">The team page will be removed, linked events and messages will be archived, and historical season records will remain.</p>
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
