<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { BackendApiError } from '../../../lib/api/BackendApi';
  import { backendClient } from '../../../lib/api/backendClient';
  import { liveScoresApi } from '../../../lib/api/LiveScoresApi';
  import { groupTeamScores, reviewTeamScores, scoreColumnCandidates, scoreImportIdentity, suggestImportTitle, suggestScoreColumns,
    type ScoreColumns, type ScoreEventOption, type ScoreImportRow } from '../../../lib/ui/teamScoreCsvImport';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import {
    normalizeName,
    readTeamCsv,
    reviewTeamCsv,
    teamCsvColumnLabel,
    teamCsvCreationIdentity,
    type TeamCsvReviewRow,
    type TeamCsvTable,
  } from '../../../lib/ui/teamCsvImport';
  import Icon from '../ui/Icon.svelte';

  export let teams: Array<{ id?: string; name?: string; title?: string }> = [];
  export let events: ScoreEventOption[] = [];
  export let onClose: (imported: number, teamsCreated?: number) => void = () => {};

  type ImportRow = TeamCsvReviewRow & Partial<ScoreImportRow> & {
    selected: boolean;
    status: 'ready' | 'importing' | 'imported' | 'duplicate' | 'retry';
  };

  const tenant = $tenantIdStore;
  const existingTeams = [...teams];
  let alive = true;
  let fileName = '';
  let importTitle = '';
  let titleEdited = false;
  let scoreChoices: number[] = [];
  let scoreSelectionRequired = false;
  let editColumns = false;
  let reading = false;
  let applying = false;
  let stopRequested = false;
  let error = '';
  let table: TeamCsvTable | null = null;
  let column: number | null = null;
  let hasHeader = false;
  let rows: ImportRow[] = [];
  let columns: ScoreColumns = { score: null, event: null, division: null, challenge: null };
  let eventOverrides: Record<string, string | undefined> = {};
  const scoreLabels = { score: 'Score', event: 'Event', division: 'Division', challenge: 'Challenge' } as const;
  const teamIds = new Map<string, string>();
  $: scoreMode = columns.score !== null;
  $: eventNames = [...new Set(rows.flatMap(row =>
    !row.teamOnly && row.eventName &&
      (editColumns || /^(Event not found|Choose the matching event)/.test(row.issue))
      ? [row.eventName.toLowerCase()] : [],
  ))];
  $: reviewedEventNames = [...new Set([...eventNames, ...Object.keys(eventOverrides)])];
  $: if ($tenantIdStore !== tenant) onClose(0);
  $: attempting = rows.some((row) => row.status !== 'ready');
  $: pending = rows.filter((row) => row.selected && ['ready', 'retry'].includes(row.status));
  $: pendingScores = pending.filter(isScoreRow);
  $: imported = rows.filter((row) => row.status === 'imported').length;
  $: existingScores = pendingScores.filter(row => row.teamId).length;
  $: newTeams = new Set(pending.filter(row => !row.teamId).map(row => row.name.toLowerCase())).size;
  $: resultCount = groupTeamScores(pendingScores).length;
  $: showTitle = rows.some(row => row.usesImportTitle);
  $: missingTitle = pendingScores.some(row => !row.title);

  onDestroy(() => { alive = false; });

  function isScoreRow(row: ImportRow): row is ImportRow & ScoreImportRow {
    return row.teamOnly === false;
  }

  function close() {
    if (applying || reading) return;
    if (scoreMode) onClose(rows.filter(row => isScoreRow(row) && row.status === 'imported').length, teamIds.size);
    else onClose(imported);
  }

  function review(keepSelection = false) {
    const selections = keepSelection ? new Map(rows.map(row => [row.line, row.selected])) : null;
    rows = table && column !== null && !scoreSelectionRequired ? (columns.score !== null
      ? reviewTeamScores(table, column, hasHeader, columns, existingTeams, events, eventOverrides, normalizeName(importTitle))
      : reviewTeamCsv(table, column, hasHeader, existingTeams))
      .map((row) => ({ ...row, selected: !row.issue && (selections?.get(row.line) ?? true), status: 'ready' as const })) : [];
  }

  function changeScoreColumn() {
    scoreSelectionRequired = false;
    changeHeader();
  }

  function changeHeader() {
    if (!titleEdited) {
      importTitle = hasHeader && columns.score !== null
        ? suggestImportTitle(table?.records[0].values[columns.score]) : '';
    }
    review();
  }

  async function chooseFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !tenant || tenant !== $tenantIdStore || reading || applying) return;
    reading = true;
    fileName = file.name;
    error = '';
    table = null;
    rows = [];
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV file smaller than 1 MB.');
      const source = await file.text();
      if (!alive || tenant !== $tenantIdStore) return;
      table = readTeamCsv(source);
      column = table.suggestedColumn ?? (table.columnCount === 1 ? 0 : null);
      columns = suggestScoreColumns(table);
      scoreChoices = scoreColumnCandidates(table);
      scoreSelectionRequired = columns.score === null && scoreChoices.length > 1;
      editColumns = column === null;
      titleEdited = false;
      importTitle = columns.score === null ? '' : suggestImportTitle(table.records[0].values[columns.score]);
      eventOverrides = {};
      hasHeader = table.suggestedColumn !== null || scoreChoices.length > 0;
      review();
    } catch (cause) {
      if (alive) error = cause instanceof Error ? cause.message : 'Save the file as CSV UTF-8 and try again.';
    } finally {
      if (alive) reading = false;
      input.value = '';
    }
  }

  function updateRow(line: number, change: Partial<ImportRow>) {
    rows = rows.map((row) => row.line === line ? { ...row, ...change } : row);
  }

  async function applyScores(selected: Array<ImportRow & ScoreImportRow>) {
    for (const group of groupTeamScores(selected)) {
      if (stopRequested || !alive || tenant !== $tenantIdStore) return;
      let activeLine = group.rows[0].line;
      try {
        const entries = [];
        for (const row of group.rows) {
          activeLine = row.line;
          const nameKey = row.name.toLowerCase();
          let id = row.teamId || teamIds.get(nameKey);
          if (!id) {
            const identity = await teamCsvCreationIdentity(row.name);
            if (!alive || tenant !== $tenantIdStore) return;
            await backendClient.importTeamFromCsv(tenant, row.name, identity);
            id = identity.id;
            teamIds.set(nameKey, id);
          }
          if (!alive || tenant !== $tenantIdStore) return;
          entries.push({ id, name: row.name, score: row.score });
        }
        entries.sort((a, b) => a.id.localeCompare(b.id));
        const ids = entries.map(entry => entry.id);
        const operationId = await scoreImportIdentity(group.title, group.eventId, group.division, ids);
        if (!alive || tenant !== $tenantIdStore) return;
        await liveScoresApi.importFinal(tenant, {
          operationId, title: group.title, eventId: group.eventId, division: group.division,
          names: entries.map(entry => entry.name), scores: entries.map(entry => entry.score), teamIds: ids,
        });
        if (!alive || tenant !== $tenantIdStore) return;
        for (const row of group.rows) updateRow(row.line, { status: 'imported' });
      } catch (cause) {
        if (!alive || tenant !== $tenantIdStore) return;
        for (const row of group.rows) updateRow(row.line, { status: 'retry' });
        const detail = cause instanceof Error ? cause.message : 'Try again.';
        error = `Could not finish “${group.title}” (CSV row ${activeLine}). Saved teams and results stay saved. ${detail}`;
        return;
      }
    }
  }

  async function applyImport() {
    if (applying || !pending.length || missingTitle || !tenant || tenant !== $tenantIdStore) return;
    error = '';
    applying = true;
    stopRequested = false;
    try {
      const selected = pending;
      if (scoreMode) {
        await applyScores(pendingScores);
        if (error) return;
      }
      for (const row of selected.filter(row => !isScoreRow(row))) {
        if (stopRequested || !alive || tenant !== $tenantIdStore) return;
        updateRow(row.line, { status: 'importing' });
        try {
          const nameKey = row.name.toLowerCase();
          if (!teamIds.has(nameKey)) {
            const identity = await teamCsvCreationIdentity(row.name);
            if (!alive || tenant !== $tenantIdStore) return;
            await backendClient.importTeamFromCsv(tenant, row.name, identity);
            if (!alive || tenant !== $tenantIdStore) return;
            if (scoreMode) teamIds.set(nameKey, identity.id);
          }
          updateRow(row.line, { status: 'imported' });
        } catch (cause) {
          if (!alive || tenant !== $tenantIdStore) return;
          if (cause instanceof BackendApiError && cause.code === 'group_name_conflict') {
            updateRow(row.line, { status: 'duplicate' });
            continue;
          }
          updateRow(row.line, { status: 'retry' });
          error = `Could not verify row ${row.line}. Select Import to retry. Completed rows stay saved.`;
          return;
        }
      }
    } finally {
      if (alive) applying = false;
    }
  }
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="team-import-title">
  <div class="crm-ui-modal-shell import-shell">
    <button type="button" class="crm-ui-backdrop" aria-label="Close team import" tabindex="-1" disabled={applying || reading} on:click={close}></button>
    <div class="import-panel" tabindex="-1" use:modalFocus={{ onEscape: close }}>
      <header>
        <h2 id="team-import-title">Import teams and scores from CSV</h2>
        <button type="button" aria-label="Close team import" class="close" disabled={applying || reading} on:click={close}><Icon name="close" size={20} /></button>
      </header>
      <div class="import-content">
        {#if !attempting}
          <div class="file-picker">
            <label class="choose-file crm-ui-button-secondary">
              <span aria-hidden="true">{fileName ? 'Replace CSV' : 'Choose CSV'}</span>
              <input type="file" aria-label="Choose CSV file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={reading || applying} on:change={chooseFile} />
            </label>
            {#if !fileName}<p>Include team names and any scores you want to publish.</p>{/if}
          </div>
        {/if}
        {#if fileName}<p class="filename">{fileName}</p>{/if}
        {#if reading}<p role="status">Reading CSV…</p>{/if}
        {#if table}
          {#if table.skippedPreamble}
            <p>Skipped report headings above the detected header row.</p>
          {/if}
          {#if scoreSelectionRequired}
            <p>This file contains multiple score columns. Choose which scores to import.</p>
          {:else if showTitle}
            <div class="title-field">
              <label for="team-import-title-value" class="crm-ui-label">Scoring event title</label>
              <input id="team-import-title-value" class="crm-ui-input" type="text" maxlength="80"
                placeholder="e.g. BOLT Challenge 1" value={importTitle} disabled={attempting || applying}
                aria-required="true"
                on:input={event => { importTitle = event.currentTarget.value; titleEdited = true; review(true); }} />
              <p>Results will appear under Scores → Past results.</p>
            </div>
          {/if}
          {#if !attempting}
            <button class="columns-toggle" type="button" aria-expanded={editColumns}
              aria-controls="team-import-columns" disabled={applying}
              on:click={() => { editColumns = !editColumns; }}>
              {editColumns ? 'Hide column settings' : 'Edit columns'}
            </button>
          {/if}
          <fieldset id="team-import-columns" disabled={attempting || applying}
            hidden={!editColumns && !scoreSelectionRequired}>
            {#if editColumns}
              <label for="team-import-column" class="crm-ui-label">Team name column</label>
              <select id="team-import-column" class="crm-ui-input" bind:value={column} on:change={() => review()}>
                <option value={null}>Choose a column</option>
                {#each Array.from({ length: table.columnCount }, (_, index) => index) as index}
                  <option value={index}>{teamCsvColumnLabel(table, index, hasHeader)}</option>
                {/each}
              </select>
            {/if}
            {#each (Object.keys(scoreLabels) as Array<keyof ScoreColumns>) as field}
              {#if field === 'score' || (editColumns && scoreMode)}
                <label for={`team-import-${field}`} class="crm-ui-label">{scoreLabels[field]} column</label>
                <select id={`team-import-${field}`} class="crm-ui-input" bind:value={columns[field]}
                  on:change={field === 'score' ? changeScoreColumn : () => review()}>
                  {#if field === 'score' && scoreSelectionRequired}
                    <option value={null} disabled>Choose a score column</option>
                  {:else}
                    <option value={null}>{field === 'score' ? 'Teams only' : 'None'}</option>
                  {/if}
                  {#each (editColumns ? Array.from({ length: table.columnCount }, (_, index) => index) : scoreChoices) as index}
                    <option value={index}>{teamCsvColumnLabel(table, index, hasHeader)}</option>
                  {/each}
                </select>
              {/if}
            {/each}
            {#if editColumns}
              <label class="check"><input type="checkbox" bind:checked={hasHeader} on:change={changeHeader} /> First row contains column headers</label>
            {/if}
          </fieldset>
          {#if scoreMode && reviewedEventNames.length}
            <fieldset class="event-matches" disabled={attempting || applying}>
              {#each reviewedEventNames as name}
                {@const row = rows.find(row => row.eventName?.toLowerCase() === name)}
                {#if row}
                  <label class="crm-ui-label">
                    Event match for {row.eventName}
                    <select class="crm-ui-input" value={eventOverrides[name] ?? row.eventId ?? '?'}
                      on:change={event => {
                        const value = event.currentTarget.value;
                        eventOverrides = { ...eventOverrides, [name]: value === '?' ? undefined : value };
                        review();
                      }}>
                      <option value="?">Choose an event</option>
                      <option value="">Leave unlinked</option>
                      {#each events.filter(event => event.id && event.title) as event}
                        <option value={event.id}>{event.title} ({event.id})</option>
                      {/each}
                    </select>
                  </label>
                {/if}
              {/each}
            </fieldset>
          {/if}
          {#if column === null}
            <p>Choose the column that contains the team names.</p>
          {:else if !scoreSelectionRequired && rows.length === 0}
            <p>There are no team names to review.</p>
          {:else if rows.length}
            <p role="status">{pending.length} ready · {imported} imported · {rows.length - pending.length - imported} skipped</p>
            {#if pendingScores.length}
              <p>{pendingScores.length} score{pendingScores.length === 1 ? '' : 's'} ready to publish{existingScores ? ` · ${existingScores} matched to existing teams` : ''}{newTeams ? ` · ${newTeams} new team${newTeams === 1 ? '' : 's'}` : ''}</p>
              {#if resultCount > 1}<p>{resultCount} result groups to publish in Past results.</p>{/if}
            {:else if !scoreMode && !attempting}
              <p>{rows.some(row => row.issue === 'Already exists in this program') ? 'Existing teams are already saved. Use Edit columns if this file includes scores.' : 'No score column selected.'}</p>
            {/if}
            <div class="row-list" aria-label="Team import preview">
              {#each rows as row (row.line)}
                {@const status = row.issue || ({ ready: '', importing: 'Importing…', imported: 'Imported', duplicate: 'Already exists in this program', retry: 'Retry needed' })[row.status]}
                <div class="row">
                  {#if !row.issue && (row.status === 'ready' || row.status === 'retry')}
                    <input type="checkbox" aria-label={`Import row ${row.line}: ${row.name}`} checked={row.selected} disabled={applying || (scoreMode && attempting)}
                      on:change={(event) => updateRow(row.line, { selected: event.currentTarget.checked })} />
                  {/if}
                  <strong>{row.name || 'Unnamed team'}{scoreMode && Number.isFinite(row.score) ? ` · ${row.score}` : ''}</strong>
                  {#if isScoreRow(row)}
                    {@const eventTitle = events.find(event => event.id === row.eventId)?.title}
                    <small>{row.teamId ? 'Existing team' : 'New team'}{!row.usesImportTitle ? ` · ${row.title}` : ''}{row.division && row.division !== row.title ? ` · ${row.division}` : ''}{eventTitle && eventTitle !== row.title ? ` · ${eventTitle}` : ''}</small>
                  {/if}
                  <span>Row {row.line}{status ? ` · ${status}` : ''}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
      <footer>
        {#if applying}
          <button type="button" class="crm-ui-button-secondary" disabled={stopRequested} on:click={() => stopRequested = true}>{stopRequested ? 'Stopping…' : scoreMode ? 'Stop after this result group' : 'Stop after this row'}</button>
        {:else}
          <button type="button" class="crm-ui-button-secondary" disabled={reading} on:click={close}>{attempting ? 'Done' : 'Close'}</button>
        {/if}
        {#if table && (pending.length || applying)}
          <button type="button" class="crm-ui-button-primary" disabled={applying || missingTitle} on:click={applyImport}>{applying ? 'Importing…' : pendingScores.length ? `Import ${pendingScores.length} score${pendingScores.length === 1 ? '' : 's'}` : `Import ${pending.length} team${pending.length === 1 ? '' : 's'}`}</button>
        {/if}
      </footer>
    </div>
  </div>
</div>

<style>
  .import-shell { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 12px; }
  .import-panel { position: relative; display: flex; flex-direction: column; box-sizing: border-box; width: min(100%, 640px); max-height: calc(100dvh - 24px); overflow: hidden; padding: 24px; border-radius: 16px; background: white; color: #182235; text-align: left; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; flex-shrink: 0; }
  h2 { margin: 0; font-size: 1.35rem; font-weight: 650; }
  .close { display: grid; place-items: center; min-width: 44px; min-height: 44px; color: #485870; }
  .import-content { min-height: 0; overflow-y: auto; padding: 2px; }
  .file-picker { margin-top: 8px; }
  .choose-file { display: inline-flex; position: relative; }
  .choose-file input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
  .choose-file:focus-within { outline: 2px solid #2858a8; outline-offset: 3px; }
  .title-field { margin-top: 16px; }
  .title-field input { width: 100%; }
  .title-field p { color: #485870; }
  .columns-toggle { color: #244a86; font-weight: 600; min-height: 44px; text-decoration: underline; }
  .filename { margin: 8px 0; overflow-wrap: anywhere; color: #485870; }
  fieldset { margin-top: 16px; }
  select { width: 100%; margin: 4px 0 8px; }
  .check { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: .875rem; }
  p { margin: 10px 0; font-size: .9rem; }
  .row-list { display: grid; border: 1px solid #dce3ed; border-radius: 10px; }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 9px 12px; min-height: 44px; }
  .row + .row { border-top: 1px solid #dce3ed; }
  .row strong { min-width: 0; overflow-wrap: anywhere; }
  .row span { margin-left: auto; color: #485870; font-size: .875rem; }
  .error { color: #b42318; }
  footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; flex-shrink: 0; padding-top: 12px; }
</style>
