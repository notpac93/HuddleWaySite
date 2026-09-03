<script lang="ts">
  import DataTable from '../DataTable.svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type RosterTransferPreview,
  } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import ParticipantDetailPanel from './ParticipantDetailPanel.svelte';

  export let players: any[] = [];
  export let setActiveTeam = (team: any) => {};
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};
  export let allTeams: any[] = [];
  export let allSeasons: any[] = [];
  export let loading = false;
  export let error = '';
  export let truncated = false;
  export let onAddPlayer: () => void = () => {};

  let roleFilter = '';
  let statusFilter = '';
  let showAdvancedFilters = false;

  let selectedPlayerIds: any[] = [];
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let bulkSelectedTeam = '';
  let bulkAction: '' | 'assign_team' | 'assign_season' | 'unassign_team' = '';
  let bulkDestination = '';
  let operationMessage = '';
  let dataTable: DataTable;
  let bulkOperationSignature = '';
  let bulkOperationKey = '';
  let operationGeneration = 0;
  let operationRequestId = '';
  let detailPlayer: any = null;
  type BulkReview =
    | {
        kind: 'team';
        signature: string;
        preview: RosterTransferPreview;
      }
    | {
        kind: 'season';
        signature: string;
        seasonId: string;
        seasonName: string;
        registrationIds: string[];
      };
  let bulkReview: BulkReview | null = null;
  const dispatch = createEventDispatcher();
  class RosterScopeChangedError extends Error {}

  onDestroy(() => {
    operationGeneration += 1;
  });

  $: {
    bulkSelectedTeam = bulkAction === 'unassign_team'
      ? 'unassign'
      : bulkAction === 'assign_season' && bulkDestination
        ? `season:${bulkDestination}`
        : bulkAction === 'assign_team'
          ? bulkDestination
          : '';
    const signature = JSON.stringify({
      tenantId: $tenantIdStore,
      selectedPlayerIds: [...selectedPlayerIds].sort(),
      bulkSelectedTeam,
    });
    if (signature !== bulkOperationSignature) {
      const changedWhileLoading = submitState === 'loading';
      bulkOperationSignature = signature;
      operationGeneration += 1;
      bulkOperationKey = signature
        ? createIdempotencyKey(
            bulkSelectedTeam.startsWith('season:')
              ? 'season-participant-assignment'
              : 'roster-atomic-transfer',
          )
        : '';
      bulkReview = null;
      operationRequestId = '';
      if (changedWhileLoading) {
        submitState = 'error';
        operationMessage =
          'The organization or reviewed selection changed. Verify the roster before trying again.';
      } else if (submitState === 'error') {
        submitState = 'idle';
        operationMessage = '';
      }
    }
  }

  function assertReviewedScope(
    tenantId: string,
    generation: number,
    signature: string,
  ) {
    if (
      generation !== operationGeneration
      || $tenantIdStore !== tenantId
      || bulkOperationSignature !== signature
    ) {
      throw new RosterScopeChangedError(
        'The organization or reviewed selection changed while the roster operation was running. No transfer was submitted.',
      );
    }
  }

  async function reviewBulkAssignment() {
    if (
      !bulkSelectedTeam
      || !$tenantIdStore
      || selectedPlayerIds.length === 0
      || submitState === 'loading'
    ) return;
    const tenantId = $tenantIdStore;
    const generation = ++operationGeneration;
    const registrationIds = [...selectedPlayerIds].sort();
    const signature = bulkOperationSignature;
    const isSeasonAssignment = bulkSelectedTeam.startsWith('season:');
    const destinationSeasonId = isSeasonAssignment
      ? bulkSelectedTeam.slice('season:'.length)
      : '';
    const destinationTeamId = isSeasonAssignment
      ? null
      : bulkSelectedTeam === 'unassign' ? null : bulkSelectedTeam;
    submitState = 'loading';
    operationMessage = 'Preparing a safe roster review…';
    operationRequestId = '';
    try {
      assertReviewedScope(tenantId, generation, signature);
      if (!bulkOperationKey) {
        bulkOperationKey = createIdempotencyKey(
          isSeasonAssignment
            ? 'season-participant-assignment'
            : 'roster-atomic-transfer',
        );
      }
      if (isSeasonAssignment) {
        bulkReview = {
          kind: 'season',
          signature,
          seasonId: destinationSeasonId,
          seasonName: transferSeasons.find((season) => season.id === destinationSeasonId)?.name
            || 'Season name unavailable',
          registrationIds,
        };
      } else {
        const preview = await backendClient.previewRosterTransfer(
          tenantId,
          registrationIds,
          destinationTeamId,
        );
        assertReviewedScope(tenantId, generation, signature);
        bulkReview = { kind: 'team', signature, preview };
      }
      assertReviewedScope(tenantId, generation, signature);
      submitState = 'idle';
      operationMessage = 'Review ready. Nothing has changed yet.';
    } catch(e) {
      if (generation !== operationGeneration || $tenantIdStore !== tenantId) return;
      operationMessage =
        e instanceof RosterScopeChangedError
          ? e.message
          : e instanceof BackendApiError
            && e.code === 'participant_team_assignment_identity_required'
            ? 'This registration needs participant identity repair before its team assignment can change. Open the participant details and complete the identity repair, then retry the review.'
          : 'The roster change could not be reviewed. Nothing was changed.';
      operationRequestId =
        e instanceof BackendApiError ? e.requestId || '' : '';
      submitState = 'error';
    }
  }

  async function confirmBulkAssignment() {
    const review = bulkReview;
    const tenantId = $tenantIdStore;
    if (!review || !tenantId || submitState === 'loading') return;
    if (review.signature !== bulkOperationSignature) {
      bulkReview = null;
      submitState = 'error';
      operationMessage = 'The reviewed selection changed. Review the roster change again.';
      return;
    }
    const generation = ++operationGeneration;
    submitState = 'loading';
    operationMessage = 'Applying the reviewed roster change…';
    operationRequestId = '';
    try {
      assertReviewedScope(tenantId, generation, review.signature);
      if (review.kind === 'season') {
        const result = await backendClient.assignSeasonParticipants(
          tenantId,
          review.seasonId,
          review.registrationIds,
          bulkOperationKey,
        );
        assertReviewedScope(tenantId, generation, review.signature);
        operationMessage =
          `Season assignment complete: ${result.assignedCount} assigned and `
          + `${result.alreadyAssignedCount} already connected.`;
      } else {
        const result = await backendClient.commitRosterTransfer(
          tenantId,
          review.preview,
          bulkOperationKey,
        );
        assertReviewedScope(tenantId, generation, review.signature);
        operationMessage =
          `Roster transfer complete: ${result.preview.addCount} added, `
          + `${result.preview.removeCount} removed, and `
          + `${result.preview.noOpCount} unchanged.`;
      }
      submitState = 'success';
      bulkReview = null;
      dispatch('changed');
      dataTable?.clearSelection();
      selectedPlayerIds = [];
      bulkSelectedTeam = '';
      bulkAction = '';
      bulkDestination = '';
      bulkOperationKey = '';
      setTimeout(() => {
        if (submitState === 'success') submitState = 'idle';
      }, 1500);
    } catch (error) {
      if (generation !== operationGeneration || $tenantIdStore !== tenantId) return;
      operationMessage = error instanceof RosterScopeChangedError
        ? error.message
        : 'The reviewed roster update could not be applied.';
      operationRequestId = error instanceof BackendApiError ? error.requestId || '' : '';
      submitState = 'error';
    }
  }

  function cancelBulkReview() {
    if (submitState === 'loading') return;
    bulkReview = null;
    submitState = 'idle';
    operationMessage = 'Review cancelled. Nothing was changed.';
    operationRequestId = '';
  }

  $: playerRows = (Array.isArray(players) ? players : [])
    .filter((player) => String(player?.id || '').trim())
    .map((player) => ({
      ...player,
      id: String(player.id).trim(),
      name: String(player.name || '').trim() || 'Name unavailable',
      email: String(player.email || '').trim(),
      role: String(player.role || '').trim() || 'Not provided',
      team: String(player.team || '').trim(),
      teamId: String(player.teamId || '').trim(),
      status: String(player.status || '').trim() || 'Not provided',
    }));
  $: if (activeResultId) {
    const linkedPlayer = playerRows.find((player) => player.id === activeResultId);
    if (linkedPlayer && detailPlayer?.id !== linkedPlayer.id) detailPlayer = linkedPlayer;
  }
  $: omittedPlayerCount =
    (Array.isArray(players) ? players.length : 0) - playerRows.length;
  $: transferTeams = (Array.isArray(allTeams) ? allTeams : [])
    .filter((team) => String(team?.id || '').trim())
    .map((team) => ({
      id: String(team.id).trim(),
      name: String(team.name || team.title || '').trim() || 'Unnamed team',
    }));
  function transferTeamName(teamId: string) {
    return transferTeams.find((team) => team.id === teamId)?.name
      || 'Team name unavailable';
  }
  $: transferSeasons = (Array.isArray(allSeasons) ? allSeasons : [])
    .filter((season) => {
      const id = String(season?.id || '').trim();
      const status = String(season?.status || '').trim().toLowerCase();
      return id && !['archived', 'deleted'].includes(status);
    })
    .map((season) => ({
      id: String(season.id).trim(),
      name: String(season.name || season.title || '').trim() || 'Unnamed season',
    }));
  $: filteredPlayers = playerRows.filter(p => {
    if (roleFilter && p.role !== roleFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });
</script>

{#if omittedPlayerCount > 0}
  <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
    {omittedPlayerCount} roster {omittedPlayerCount === 1 ? 'record was' : 'records were'} omitted because no stable registration ID was provided.
  </p>
{/if}

<DataTable
  bind:this={dataTable}
  data={filteredPlayers}
  columns={[
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'team', label: 'Team' },
    { key: 'status', label: 'Status' }
    ,{ key: 'details', label: '' }
  ]}
  exportFilename="roster"
  searchPlaceholder="Search players..."
  selectable={true}
  filterable={true}
  filterExpanded={showAdvancedFilters}
  activeRowId={activeResultId}
  {loading}
  {error}
  {truncated}
  {onTargetConsumed}
  on:selectionChange={(e) => selectedPlayerIds = e.detail}
  on:filter={() => showAdvancedFilters = !showAdvancedFilters}
>
  <svelte:fragment slot="filters">
    {#if operationMessage}
      <span class="ml-4 text-sm text-gray-700" role={submitState === 'error' ? 'alert' : 'status'}>
        {operationMessage}
      </span>
    {/if}
    {#if selectedPlayerIds.length > 0}
      <div class="crm-theme-selected flex items-center space-x-2 border rounded-md px-3 py-1.5 ml-4">
        <span class="text-sm font-medium">{selectedPlayerIds.length} selected</span>
        <div class="w-px h-4 bg-[var(--crm-brand-border)] mx-2"></div>
        <label>
          <span class="sr-only">Bulk roster action</span>
          <select bind:value={bulkAction} on:change={() => bulkDestination = ''} disabled={submitState === 'loading' || Boolean(bulkReview)} class="text-sm border-gray-300 rounded-md py-1 pl-2 pr-8 focus:outline-none focus:ring-[var(--crm-brand-focus)] focus:border-[var(--crm-brand-border)] disabled:opacity-50">
          <option value="">Choose action</option><option value="assign_team">Assign team</option><option value="assign_season">Assign season</option><option value="unassign_team">Unassign from team</option>
          </select>
        </label>
        {#if bulkAction === 'assign_team'}<label><span class="sr-only">Destination team</span><select bind:value={bulkDestination} class="rounded-md border-gray-300 py-1 text-sm" disabled={submitState === 'loading' || Boolean(bulkReview)}><option value="">Choose team</option>{#each transferTeams as team}<option value={team.id}>{team.name}</option>{/each}</select></label>{:else if bulkAction === 'assign_season'}<label><span class="sr-only">Destination season</span><select bind:value={bulkDestination} class="rounded-md border-gray-300 py-1 text-sm" disabled={submitState === 'loading' || Boolean(bulkReview)}><option value="">Choose season</option>{#each transferSeasons as season}<option value={season.id}>{season.name}</option>{/each}</select></label>{/if}
        {#if !bulkReview}
          <StatusButton
            type="button"
            state={submitState}
            on:click={reviewBulkAssignment}
            disabled={submitState === 'loading' || !bulkSelectedTeam}
            idleText="Review change"
            loadingText="Reviewing..."
            successText="Reviewed"
            errorText="Retry review"
            class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-3 py-1 rounded text-sm font-medium hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
          />
        {/if}
      </div>
      {#if bulkSelectedTeam && !bulkReview}<p class="ml-4 text-xs text-gray-600">Next: review how {selectedPlayerIds.length} selected registration{selectedPlayerIds.length === 1 ? '' : 's'} will {bulkAction === 'assign_team' ? `move to team ${transferTeams.find((team) => team.id === bulkDestination)?.name || bulkDestination}` : bulkAction === 'assign_season' ? `be connected to season ${transferSeasons.find((season) => season.id === bulkDestination)?.name || bulkDestination}` : 'be unassigned from their current team'}.</p>{/if}
      {#if operationRequestId && submitState === 'error' && !bulkReview}
        <p class="ml-4 mt-2 text-xs text-gray-600">If retrying does not work, contact support with reference {operationRequestId}.</p>
      {/if}
      {#if bulkReview}
        <section class="ml-4 mt-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-labelledby="roster-change-review-title">
          <h3 id="roster-change-review-title" class="font-semibold">Review roster change</h3>
          <p class="mt-1">Nothing has changed yet. Confirm only after checking this impact.</p>
          {#if bulkReview.kind === 'team'}
            <p class="mt-2 font-medium">
              {bulkReview.preview.registrationIds.length} registration{bulkReview.preview.registrationIds.length === 1 ? '' : 's'}:
              {bulkReview.preview.addCount} team assignment{bulkReview.preview.addCount === 1 ? '' : 's'} added,
              {bulkReview.preview.removeCount} removed, and
              {bulkReview.preview.noOpCount} unchanged.
            </p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              {#each bulkReview.preview.rows.slice(0, 10) as row}
                <li>
                  {row.label || playerRows.find((player) => player.id === row.registrationId)?.name || 'Participant name unavailable'}:
                  {row.beforeTeamIds.length ? row.beforeTeamIds.map(transferTeamName).join(', ') : 'Unassigned'}
                  →
                  {row.afterTeamIds.length ? row.afterTeamIds.map(transferTeamName).join(', ') : 'Unassigned'}
                </li>
              {/each}
            </ul>
            {#if bulkReview.preview.rows.length > 10}<p class="mt-2">Plus {bulkReview.preview.rows.length - 10} more reviewed registration{bulkReview.preview.rows.length - 10 === 1 ? '' : 's'}.</p>{/if}
          {:else}
            <p class="mt-2 font-medium">
              Connect {bulkReview.registrationIds.length} registration{bulkReview.registrationIds.length === 1 ? '' : 's'} to season {bulkReview.seasonName}.
            </p>
          {/if}
          <div class="mt-4 flex flex-wrap gap-3">
            <StatusButton
              type="button"
              state={submitState}
              on:click={confirmBulkAssignment}
              disabled={submitState === 'loading'}
              idleText="Confirm roster change"
              loadingText="Applying..."
              successText="Applied"
              errorText="Retry confirmed change"
              class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-3 py-1 rounded text-sm font-medium hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
            />
            <button type="button" class="crm-ui-button-secondary px-3 py-1 text-sm" disabled={submitState === 'loading'} on:click={cancelBulkReview}>Cancel review</button>
          </div>
          {#if operationRequestId && submitState === 'error'}
            <p class="mt-2 text-xs">If retrying does not work, contact support with reference {operationRequestId}.</p>
          {/if}
        </section>
      {/if}
    {/if}
    {#if showAdvancedFilters && selectedPlayerIds.length === 0}
      <label>
        <span class="sr-only">Filter players by role</span>
        <select bind:value={roleFilter} class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-[var(--crm-brand-focus)] focus:border-[var(--crm-brand-border)]">
        <option value="">All Roles</option>
        <option value="Player">Player</option>
        <option value="Coach">Coach</option>
        <option value="Manager">Manager</option>
        <option value="Staff">Staff</option>
        </select>
      </label>
      <label>
        <span class="sr-only">Filter players by status</span>
        <select bind:value={statusFilter} class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-[var(--crm-brand-focus)] focus:border-[var(--crm-brand-border)]">
        <option value="">All Statuses</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
        <option value="Waitlisted">Waitlisted</option>
        </select>
      </label>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="actions">
    <button
      type="button"
      class="inline-flex items-center rounded-md bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-brand-focus)] focus:ring-offset-2"
      on:click={onAddPlayer}
    >
      <span class="mr-2 text-lg leading-none" aria-hidden="true">+</span>
      Add player
    </button>
  </svelte:fragment>

  <svelte:fragment slot="cell" let:row let:column>
    {#if column.key === 'name'}
      <div class="crm-ui-center">
        <div class="flex-shrink-0 h-10 w-10">
          {#if row.imageUrl}
            <img
              class="h-10 w-10 rounded-full object-cover"
              src={row.imageUrl}
              alt=""
              width="40"
              height="40"
              loading="lazy"
              decoding="async"
            />
          {:else}
            <div class="h-10 w-10 rounded-full bg-[var(--crm-brand-surface)] flex items-center justify-center text-[var(--crm-brand-link)] font-bold">
              {row.name.charAt(0).toUpperCase()}
            </div>
          {/if}
        </div>
        <div class="ml-4">
          <button
            type="button"
            class="text-left text-sm font-medium text-[var(--crm-brand-link)] hover:text-[var(--crm-brand-primary-hover)] hover:underline"
            aria-label={`Open ${row.name} details`}
            on:click={() => detailPlayer = row}
          >
            {row.name}
          </button>
          <div class="text-sm text-gray-500">{row.email}</div>
        </div>
      </div>
    {:else if column.key === 'team'}
      {#if row.teamId}
        <button
          type="button"
          class="bg-[var(--crm-brand-surface)] text-[var(--crm-brand-link)] hover:bg-[var(--crm-brand-surface-strong)] text-xs px-2 py-1 rounded-full cursor-pointer transition-colors"
          on:click={() => setActiveTeam({ name: row.team, id: row.teamId })}
        >
          {row.team}
        </button>
      {:else}
        <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{row.team || 'Unassigned'}</span>
      {/if}
    {:else if column.key === 'status'}
      <span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">{row.status}</span>
    {:else if column.key === 'details'}
      <button type="button" class="text-sm font-semibold text-[var(--crm-brand-link)] hover:text-[var(--crm-brand-primary-hover)]" on:click={() => detailPlayer = row}>Details</button>
    {:else}
      {row[column.key]}
    {/if}
  </svelte:fragment>
</DataTable>

{#if detailPlayer}
  <ParticipantDetailPanel player={detailPlayer} onClose={() => detailPlayer = null} onChanged={() => dispatch('changed')} />
{/if}
