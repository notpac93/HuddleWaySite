<script lang="ts">
  import Papa from 'papaparse';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type RosterChange,
    type RosterPreview,
  } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import { onDestroy } from 'svelte';

  export let activeTeam = null;
  export let teams: any[] = [];

  let csvFile: File | null = null;
  let importStatus = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let commitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let selectedTeamId = '';
  let preview: RosterPreview | null = null;
  let operationGeneration = 0;
  let importScopeSignature = '';
  let lastActiveTeamId = '';
  let commitIdempotencyKey = '';
  let operationRequestId = '';
  let fileInput: HTMLInputElement;

  class RosterCsvValidationError extends Error {}

  function supportSafeFailure(
    error: unknown,
    fallback: string,
  ) {
    operationRequestId =
      error instanceof BackendApiError ? error.requestId || '' : '';
    return error instanceof RosterCsvValidationError
      ? error.message
      : fallback;
  }

  $: activeTeamId =
    typeof activeTeam === 'object' && activeTeam
      ? String(activeTeam.id || '')
      : String(activeTeam || '');
  $: availableTeams = (Array.isArray(teams) ? teams : [])
    .filter((team) => String(team?.id || '').trim())
    .map((team) => ({
      id: String(team.id).trim(),
      name: String(team.name || team.title || '').trim() || 'Unnamed team',
    }));
  $: operationLocked =
    submitState === 'loading' || commitState === 'loading';
  $: if (activeTeamId !== lastActiveTeamId) {
    lastActiveTeamId = activeTeamId;
    if (activeTeamId) selectedTeamId = activeTeamId;
  }
  $: {
    const signature = JSON.stringify({
      tenantId: $tenantIdStore,
      selectedTeamId,
    });
    if (signature !== importScopeSignature) {
      const changedWhileRunning =
        submitState === 'loading' || commitState === 'loading';
      importScopeSignature = signature;
      operationGeneration += 1;
      preview = null;
      commitIdempotencyKey = '';
      submitState = 'idle';
      commitState = 'idle';
      importStatus = changedWhileRunning
        ? 'The organization or destination changed. Verify the roster before trying again.'
        : '';
      operationRequestId = '';
      if (changedWhileRunning) commitState = 'error';
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
  });

  function handleFileUpload(event) {
    operationGeneration += 1;
    csvFile = event.currentTarget.files?.[0] ?? null;
    preview = null;
    commitIdempotencyKey = '';
    importStatus = '';
    operationRequestId = '';
    submitState = 'idle';
    commitState = 'idle';
  }

  async function processImport() {
    if (
      !csvFile
      || !selectedTeamId
      || !$tenantIdStore
      || submitState === 'loading'
      || preview
    ) return;
    const tenantId = $tenantIdStore;
    const teamId = selectedTeamId;
    const file = csvFile;
    const generation = ++operationGeneration;
    const scopeIsCurrent = () =>
      generation === operationGeneration
      && $tenantIdStore === tenantId
      && selectedTeamId === teamId
      && csvFile === file;
    importStatus = 'Validating roster changes…';
    operationRequestId = '';
    submitState = 'loading';

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (!scopeIsCurrent()) return;
        try {
          const changes: RosterChange[] = [];
          const invalidRows: number[] = [];
          for (const [index, rawRow] of (results.data as Array<Record<string, unknown>>).entries()) {
            const registrationId = String(
              rawRow.registrationId
                || rawRow['Registration ID']
                || rawRow.registration_id
                || '',
            ).trim();
            const action = String(rawRow.action || rawRow.Action || 'add')
              .trim()
              .toLowerCase();
            if (!registrationId || !['add', 'remove'].includes(action)) {
              invalidRows.push(index + 2);
              continue;
            }
            changes.push({
              registrationId,
              action: action as 'add' | 'remove',
            });
          }
          if (invalidRows.length > 0) {
            throw new RosterCsvValidationError(
              `Rows ${invalidRows.slice(0, 8).join(', ')} need a Registration ID and add/remove action.`,
            );
          }
          if (changes.length === 0) {
            throw new RosterCsvValidationError(
              'The CSV does not contain any roster changes.',
            );
          }
          const reviewedPreview =
            await backendClient.previewRosterChanges(
            tenantId,
            teamId,
            changes,
          );
          if (!scopeIsCurrent()) return;
          preview = reviewedPreview;
          commitIdempotencyKey = createIdempotencyKey(`roster-${teamId}`);
          importStatus =
            `Review ${preview.addCount} additions, ${preview.removeCount} removals, and ${preview.noOpCount} unchanged rows.`;
          submitState = 'success';
        } catch (error) {
          if (!scopeIsCurrent()) return;
          preview = null;
          importStatus = supportSafeFailure(
            error,
            'The roster preview could not be created.',
          );
          submitState = 'error';
        }
      },
      error: () => {
        if (!scopeIsCurrent()) return;
        operationRequestId = '';
        importStatus = 'The CSV file could not be parsed.';
        submitState = 'error';
      }
    });
  }

  async function commitImport() {
    if (
      !preview
      || !$tenantIdStore
      || !selectedTeamId
      || commitState === 'loading'
    ) return;
    const tenantId = $tenantIdStore;
    const teamId = selectedTeamId;
    const reviewedPreview = preview;
    const generation = operationGeneration;
    if (!commitIdempotencyKey) {
      commitIdempotencyKey = createIdempotencyKey(`roster-${teamId}`);
    }
    commitState = 'loading';
    importStatus = 'Applying the reviewed roster changes…';
    operationRequestId = '';
    try {
      const result = await backendClient.commitRosterChanges(
        tenantId,
        teamId,
        reviewedPreview,
        commitIdempotencyKey,
      );
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || selectedTeamId !== teamId
        || preview !== reviewedPreview
      ) return;
      importStatus =
        `Roster updated: ${result.preview.addCount} added, ${result.preview.removeCount} removed, ${result.preview.noOpCount} unchanged.`;
      commitState = 'success';
      preview = null;
      csvFile = null;
      commitIdempotencyKey = '';
      operationRequestId = '';
      if (fileInput) fileInput.value = '';
    } catch (error) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || selectedTeamId !== teamId
        || preview !== reviewedPreview
      ) return;
      importStatus = supportSafeFailure(
        error,
        'The reviewed roster changes could not be applied.',
      );
      commitState = 'error';
    }
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-8 max-w-2xl mx-auto mt-8">
  <h3 class="text-xl font-bold text-gray-900 mb-2">Import Roster Changes via CSV</h3>
  <p class="text-sm text-gray-500 mb-6">Use stable registration IDs so the backend can preview and apply canonical team memberships. Required columns: <strong class="font-medium text-gray-700">Registration ID, Action</strong> where Action is <code>add</code> or <code>remove</code>.</p>

  <label for="roster-team" class="block text-sm font-medium text-gray-700 mb-2">Destination team</label>
  <select id="roster-team" bind:value={selectedTeamId} disabled={operationLocked} class="mb-6 block w-full rounded-md border border-gray-300 p-2 text-sm disabled:cursor-wait disabled:opacity-50">
    <option value="">Select a team</option>
    {#each availableTeams as team (team.id)}
      <option value={team.id}>{team.name}</option>
    {/each}
  </select>

  <div class="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:bg-gray-50 transition-colors">
    <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
    <label class="cursor-pointer bg-white text-[var(--crm-brand-link)] font-medium border border-[var(--crm-brand-border)] px-4 py-2 rounded-md hover:bg-[var(--crm-brand-surface)]">
      <span>Select CSV File</span>
      <input bind:this={fileInput} type="file" accept=".csv" disabled={operationLocked} class="hidden" on:change={handleFileUpload}>
    </label>
    {#if csvFile}
      <p class="mt-4 text-sm text-gray-900 font-medium">{csvFile.name}</p>
    {:else}
      <p class="mt-4 text-sm text-gray-500">Choose a CSV file to continue.</p>
    {/if}
  </div>

  <div class="mt-6 flex justify-end items-center">
    {#if importStatus}
      <span class="mr-4 text-sm font-medium {submitState === 'error' || commitState === 'error' ? 'text-red-600' : 'text-gray-700'}" role={submitState === 'error' || commitState === 'error' ? 'alert' : 'status'}>
        {importStatus}
      </span>
    {/if}
    <StatusButton
      state={submitState}
      disabled={!csvFile || !selectedTeamId || Boolean(preview)}
      on:click={processImport}
      idleText="Review Changes"
      loadingText="Reviewing..."
      successText="Reviewed"
      errorText="Retry Review"
      class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-6 py-2 rounded-md text-sm font-medium hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
    />
  </div>

  {#if preview}
    <div class="mt-6 rounded-md border border-blue-200 bg-blue-50 p-4">
      <h4 class="font-semibold text-blue-950">Server preview ready</h4>
      <p class="mt-1 text-sm text-blue-900">
        {preview.addCount} additions · {preview.removeCount} removals · {preview.noOpCount} unchanged
      </p>
      <div class="mt-4 flex justify-end">
        <StatusButton
          state={commitState}
          on:click={commitImport}
          idleText="Apply Reviewed Changes"
          loadingText="Applying..."
          successText="Applied"
          errorText="Retry Apply"
          class="bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] px-6 py-2 rounded-md text-sm font-medium hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50"
        />
      </div>
    </div>
  {/if}
</div>
