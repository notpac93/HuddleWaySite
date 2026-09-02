<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { backendClient } from '../../../lib/api/backendClient';
  import { createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { normalizeCsvHeader, parseCsv } from '../../../lib/ui/csvImport';
  import ChangeReceipt from '../ui/ChangeReceipt.svelte';

  export let tenantId = '';
  export let teams: Array<Record<string, any>> = [];
  export let seasons: Array<Record<string, any>> = [];
  export let initialMode: 'manual' | 'csv' = 'manual';

  type ParticipantRow = {
    rowNumber: number;
    formData: Record<string, string>;
    teamIds: string[];
    seasonIds: string[];
  };

  const dispatch = createEventDispatcher();
  let mode = initialMode;
  let formData: Record<string, string> = {};
  let selectedTeamIds = new Set<string>();
  let selectedSeasonIds = new Set<string>();
  let csvRows: ParticipantRow[] = [];
  let csvFileName = '';
  let csvSummary = '';
  let reviewState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let reviewedRows: Array<{
    rowNumber: number;
    participantName: string;
    registrationEmail: string;
    status: 'valid' | 'rejected';
    reasonCode: string | null;
    message: string | null;
  }> = [];
  let error = '';
  let isSaving = false;
  let batchKey = '';
  let committedRows: ParticipantRow[] = [];
  let committedRegistrationIds: string[] = [];
  let committedSavedCount = 0;
  let assignmentRecoveryRequired = false;

  const manualFields = [
    { id: 'player_name', label: 'Person name', type: 'text', required: true },
    { id: 'parent_email', label: 'Email address', type: 'email', required: true },
    { id: 'parent_name', label: 'Parent / guardian name', type: 'text', required: false },
    { id: 'parent_phone', label: 'Phone number', type: 'tel', required: false },
    { id: 'player_dob', label: 'Date of birth', type: 'date', required: false },
    { id: 'player_grade', label: 'Grade', type: 'text', required: false },
    { id: 'notes', label: 'Internal notes', type: 'text', required: false },
  ];

  $: availableTeams = (Array.isArray(teams) ? teams : [])
    .filter((team) => String(team?.id || '').trim())
    .map((team) => ({
      id: String(team.id).trim(),
      name: String(team.name || team.title || 'Unnamed team').trim(),
    }));
  $: availableSeasons = (Array.isArray(seasons) ? seasons : [])
    .filter((season) =>
      String(season?.id || '').trim()
      && ['active', 'upcoming'].includes(String(season.status || '').trim().toLowerCase()),
    )
    .map((season) => ({
      id: String(season.id).trim(),
      name: String(season.name || season.title || 'Unnamed season').trim(),
    }));

  function resetOperation() {
    batchKey = '';
    error = '';
    reviewState = 'idle';
    reviewedRows = [];
    committedRows = [];
    committedRegistrationIds = [];
    committedSavedCount = 0;
    assignmentRecoveryRequired = false;
  }

  function setField(id: string, value: string) {
    formData = { ...formData, [id]: value };
    resetOperation();
  }

  function toggleSelection(kind: 'team' | 'season', id: string) {
    const current = kind === 'team' ? selectedTeamIds : selectedSeasonIds;
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (kind === 'team') selectedTeamIds = next;
    else selectedSeasonIds = next;
    batchKey = '';
    error = '';
  }

  function resolveAssignments(
    value: string,
    options: Array<{ id: string; name: string }>,
    label: string,
    rowNumber: number,
  ) {
    if (!value.trim()) return [];
    const byId = new Map(options.map((option) => [option.id.toLowerCase(), option.id]));
    const byName = new Map(options.map((option) => [option.name.toLowerCase(), option.id]));
    return value.split(/[;|]/).map((entry) => {
      const normalized = entry.trim().toLowerCase();
      const id = byId.get(normalized) || byName.get(normalized);
      if (!id) throw new Error(`CSV row ${rowNumber}: ${label} “${entry.trim()}” was not found.`);
      return id;
    });
  }

  function buildCsvRows(text: string): ParticipantRow[] {
    const parsed = parseCsv(text);
    const supportedFields = new Set(manualFields.map((field) => field.id));
    const aliases: Record<string, string> = {
      name: 'player_name',
      person: 'player_name',
      personname: 'player_name',
      participant: 'player_name',
      participantname: 'player_name',
      player: 'player_name',
      email: 'parent_email',
      guardianemail: 'parent_email',
      phone: 'parent_phone',
      guardianphone: 'parent_phone',
      dateofbirth: 'player_dob',
      dob: 'player_dob',
      teams: 'team_ids',
      team: 'team_ids',
      teamnames: 'team_ids',
      seasons: 'season_ids',
      season: 'season_ids',
      seasonnames: 'season_ids',
    };
    const mappedHeaders = parsed.headers.map((header) => {
      const normalized = normalizeCsvHeader(header);
      const exact = manualFields.find((field) => normalizeCsvHeader(field.id) === normalized)?.id;
      if (exact) return exact;
      if (['teamids', 'seasonids'].includes(normalized)) {
        return normalized === 'teamids' ? 'team_ids' : 'season_ids';
      }
      return aliases[normalized] || '';
    });
    if (!mappedHeaders.includes('player_name') || !mappedHeaders.includes('parent_email')) {
      throw new Error('CSV needs player_name and parent_email columns.');
    }
    const rows = parsed.rows.map((values, index) => {
      const rowNumber = index + 2;
      const data: Record<string, string> = {};
      let teamValue = '';
      let seasonValue = '';
      mappedHeaders.forEach((fieldId, columnIndex) => {
        const value = String(values[columnIndex] || '').trim();
        if (supportedFields.has(fieldId)) data[fieldId] = value;
        else if (fieldId === 'team_ids') teamValue = value;
        else if (fieldId === 'season_ids') seasonValue = value;
      });
      if (!data.player_name || !/^\S+@\S+\.\S+$/.test(data.parent_email || '')) {
        throw new Error(`CSV row ${rowNumber} requires a person name and valid email address.`);
      }
      return {
        rowNumber,
        formData: data,
        teamIds: resolveAssignments(teamValue, availableTeams, 'team', rowNumber),
        seasonIds: resolveAssignments(seasonValue, availableSeasons, 'season', rowNumber),
      };
    });
    if (!rows.length) throw new Error('CSV file does not contain any people.');
    if (rows.length > 200) throw new Error('CSV imports are limited to 200 people per upload.');
    return rows;
  }

  async function handleFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    csvFileName = file.name;
    csvRows = [];
    csvSummary = '';
    resetOperation();
    try {
      csvRows = buildCsvRows(await file.text());
      csvSummary = `${csvRows.length} ${csvRows.length === 1 ? 'row' : 'rows'} parsed locally.`;
      await reviewParticipants(csvRows);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The CSV file could not be read.';
    }
  }

  async function reviewParticipants(rows: ParticipantRow[]) {
    if (!tenantId || !rows.length) return;
    reviewState = 'loading';
    reviewedRows = [];
    error = '';
    try {
      const preview = await backendClient.previewRosterParticipants(
        tenantId,
        rows.map((row) => ({ rowNumber: row.rowNumber, formData: row.formData })),
      );
      reviewedRows = preview.rows;
      reviewState = 'ready';
      csvSummary = `${preview.validCount} valid · ${preview.rejectedCount} rejected · no people created yet.`;
    } catch (caught) {
      reviewState = 'error';
      error = caught instanceof Error
        ? caught.message
        : 'The participant preview could not be completed.';
    }
  }

  function rowsForSubmission(): ParticipantRow[] {
    const rows = mode === 'manual'
      ? [{ rowNumber: 2, formData, teamIds: [], seasonIds: [] }]
      : csvRows;
    const validRowNumbers = new Set(
      reviewedRows
        .filter((row) => row.status === 'valid')
        .map((row) => row.rowNumber),
    );
    return rows.filter((row) => validRowNumbers.has(row.rowNumber)).map((row) => ({
      ...row,
      teamIds: Array.from(new Set([...row.teamIds, ...selectedTeamIds])),
      seasonIds: Array.from(new Set([...row.seasonIds, ...selectedSeasonIds])),
    }));
  }

  async function applyAssignments(rows: ParticipantRow[], registrationIds: string[]) {
    const registrationsByTeam = new Map<string, string[]>();
    const registrationsBySeason = new Map<string, string[]>();
    rows.forEach((row, index) => {
      const registrationId = registrationIds[index];
      row.teamIds.forEach((teamId) => registrationsByTeam.set(
        teamId,
        [...(registrationsByTeam.get(teamId) || []), registrationId],
      ));
      row.seasonIds.forEach((seasonId) => registrationsBySeason.set(
        seasonId,
        [...(registrationsBySeason.get(seasonId) || []), registrationId],
      ));
    });
    for (const [teamId, ids] of registrationsByTeam) {
      const preview = await backendClient.previewRosterChanges(
        tenantId,
        teamId,
        ids.map((registrationId) => ({ registrationId, action: 'add' as const })),
      );
      await backendClient.commitRosterChanges(
        tenantId,
        teamId,
        preview,
        `${batchKey}:team:${teamId}`.slice(0, 190),
      );
    }
    for (const [seasonId, ids] of registrationsBySeason) {
      await backendClient.assignSeasonParticipants(
        tenantId,
        seasonId,
        ids,
        `${batchKey}:season:${seasonId}`.slice(0, 190),
      );
    }
    return {
      teamCount: registrationsByTeam.size,
      seasonCount: registrationsBySeason.size,
    };
  }

  async function submit() {
    if (!tenantId || isSaving) return;
    error = '';
    const candidateRows = mode === 'manual'
      ? [{ rowNumber: 2, formData, teamIds: [], seasonIds: [] }]
      : csvRows;
    if (mode === 'manual' && (!formData.player_name?.trim() || !/^\S+@\S+\.\S+$/.test(formData.parent_email || ''))) {
      error = 'Enter a person name and valid email address.';
      return;
    }
    if (!candidateRows.length) {
      error = 'Choose a CSV file first.';
      return;
    }
    if (assignmentRecoveryRequired) {
      isSaving = true;
      try {
        const assignment = await applyAssignments(
          committedRows,
          committedRegistrationIds,
        );
        assignmentRecoveryRequired = false;
        dispatch('success', {
          savedCount: committedSavedCount,
          teamCount: assignment.teamCount,
          seasonCount: assignment.seasonCount,
          recoveredAssignments: true,
        });
      } catch {
        error = 'The people are still saved, but assignments could not be completed. Retry assignments without importing the people again.';
      } finally {
        isSaving = false;
      }
      return;
    }
    if (reviewState !== 'ready') {
      await reviewParticipants(candidateRows);
      return;
    }
    const rows = rowsForSubmission();
    if (!rows.length) {
      error = 'No valid people are available to add. Correct the rejected rows and review again.';
      return;
    }
    if (!batchKey) batchKey = createIdempotencyKey('crm-roster-participant-import');
    isSaving = true;
    let peopleCreated = false;
    try {
      const result = await backendClient.importRosterParticipants(
        tenantId,
        rows.map((row) => ({ rowNumber: row.rowNumber, formData: row.formData })),
        batchKey,
      );
      peopleCreated = true;
      committedRows = rows;
      committedRegistrationIds = result.registrationIds;
      committedSavedCount = result.savedCount;
      const assignment = await applyAssignments(rows, result.registrationIds);
      dispatch('success', {
        savedCount: result.savedCount,
        teamCount: assignment.teamCount,
        seasonCount: assignment.seasonCount,
      });
    } catch (caught) {
      assignmentRecoveryRequired = peopleCreated;
      error = peopleCreated
        ? 'People were added to the program, but at least one team or season assignment failed. Retry assignments without importing the people again.'
        : caught instanceof Error
          ? caught.message
          : 'The people could not be added.';
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
  <div class="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="roster-entry-title">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h2 id="roster-entry-title" class="text-xl font-semibold text-[var(--crm-brand-link)]">Add players to the program</h2>
        <p class="mt-1 text-sm text-gray-600">Create program members, then optionally place them on teams and in seasons.</p>
      </div>
      <button type="button" aria-label="Close" class="text-2xl leading-none text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || assignmentRecoveryRequired} on:click={() => dispatch('cancel')}>×</button>
    </div>

    <div class="mt-5 border-b border-gray-200">
      <nav class="flex gap-6" aria-label="Add players method">
        <button type="button" class="border-b-2 px-1 pb-3 text-sm font-semibold {mode === 'manual' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500'}" on:click={() => { mode = 'manual'; resetOperation(); }}>Add one player</button>
        <button type="button" class="border-b-2 px-1 pb-3 text-sm font-semibold {mode === 'csv' ? 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]' : 'border-transparent text-gray-500'}" on:click={() => { mode = 'csv'; resetOperation(); }}>Upload players CSV</button>
      </nav>
    </div>

    <div class="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        {#if mode === 'manual'}
          <div class="grid gap-4 sm:grid-cols-2">
            {#each manualFields as field}
              <label class="block text-sm font-medium text-gray-700 {field.id === 'notes' ? 'sm:col-span-2' : ''}">
                {field.label}{#if field.required} <span class="text-red-600">*</span>{/if}
                <input class="mt-1 block w-full rounded border border-gray-300 px-3 py-2" type={field.type} value={formData[field.id] || ''} on:input={(event) => setField(field.id, (event.currentTarget as HTMLInputElement).value)} />
              </label>
            {/each}
          </div>
        {:else}
          <div class="space-y-4">
            <p class="text-sm text-gray-600">Required CSV columns: <code>player_name</code> and <code>parent_email</code>. Optional assignment columns: <code>team_ids</code> and <code>season_ids</code>. Separate multiple IDs or names with a semicolon.</p>
            <input class="block w-full rounded border border-gray-300 px-3 py-2 text-sm" type="file" accept=".csv,text/csv" disabled={isSaving} on:change={handleFile} />
            {#if csvFileName}<p class="text-sm text-gray-700">{csvFileName}{csvSummary ? ` · ${csvSummary}` : ''}</p>{/if}
            {#if reviewState === 'loading'}<p class="text-sm text-gray-600" role="status">Checking identities and duplicates against the program…</p>{/if}
            {#if reviewedRows.length}
              <div class="max-h-72 overflow-auto rounded-lg border border-gray-200">
                <table class="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead class="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-3 py-2">Row</th><th class="px-3 py-2">Person</th><th class="px-3 py-2">Email</th><th class="px-3 py-2">Review</th></tr></thead>
                  <tbody class="divide-y divide-gray-100">
                    {#each reviewedRows as row}
                      <tr><td class="px-3 py-2">{row.rowNumber}</td><td class="px-3 py-2 font-medium text-gray-900">{row.participantName || 'Missing'}</td><td class="px-3 py-2">{row.registrationEmail || 'Missing'}</td><td class="px-3 py-2"><span class={row.status === 'valid' ? 'text-emerald-700' : 'text-red-700'}>{row.status === 'valid' ? 'Valid' : row.message}</span></td></tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="space-y-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <h3 class="text-sm font-semibold text-gray-900">Teams</h3>
          <p class="mb-2 text-xs text-gray-500">Optional. Choose one or more.</p>
          <div class="max-h-40 space-y-2 overflow-y-auto">
            {#each availableTeams as team}
              <label class="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={selectedTeamIds.has(team.id)} on:change={() => toggleSelection('team', team.id)} /> {team.name}</label>
            {:else}
              <p class="text-xs text-gray-500">No teams available.</p>
            {/each}
          </div>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-900">Seasons</h3>
          <p class="mb-2 text-xs text-gray-500">Active or upcoming seasons only.</p>
          <div class="max-h-40 space-y-2 overflow-y-auto">
            {#each availableSeasons as season}
              <label class="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={selectedSeasonIds.has(season.id)} on:change={() => toggleSelection('season', season.id)} /> {season.name}</label>
            {:else}
              <p class="text-xs text-gray-500">No assignable seasons available.</p>
            {/each}
          </div>
        </div>
      </aside>
    </div>

    {#if assignmentRecoveryRequired}
      <div class="mt-5"><ChangeReceipt status="partial" title="People saved; assignments incomplete" message={error} reference={batchKey} retryLabel="Retry assignments only" dismissLabel="" onRetry={() => { void submit(); }} /></div>
    {:else if error}<p class="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>{/if}

    <div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5">
      <button type="button" class="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700" disabled={isSaving || assignmentRecoveryRequired} on:click={() => dispatch('cancel')}>{assignmentRecoveryRequired ? 'Finish assignments to close' : 'Cancel'}</button>
      {#if !assignmentRecoveryRequired}<button type="button" class="rounded bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || (mode === 'csv' && (!csvRows.length || reviewState === 'loading'))} on:click={submit}>{isSaving ? 'Saving…' : reviewState !== 'ready' ? (mode === 'manual' ? 'Review player' : 'Review CSV') : mode === 'manual' ? 'Add player' : `Add ${reviewedRows.filter((row) => row.status === 'valid').length} valid ${reviewedRows.filter((row) => row.status === 'valid').length === 1 ? 'player' : 'players'}`}</button>{/if}
    </div>
  </div>
</div>
