<script lang="ts">
  import CrmLogo from '../ui/CrmLogo.svelte';
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
  let showAllRows = false;
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
      showAllRows = false;
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

<svelte:head><link rel="stylesheet" href="/admin-score-import.css" /></svelte:head>

<div class="crm-ui-modal-root crm-score-import" role="dialog" aria-modal="true" aria-labelledby="team-import-title">
  <div class="crm-ui-modal-shell import-shell">
    <button type="button" class="crm-ui-backdrop" aria-label="Close team import" tabindex="-1" disabled={applying || reading} on:click={close}></button>
    <div class="import-panel crm-auth-shell" tabindex="-1" use:modalFocus={{ onEscape: close }}>
      <CrmLogo class="crm-auth-watermark" />
      <header>
        <div class="crm-auth-brand-mark"><CrmLogo /></div>
        <h2 id="team-import-title">Import teams &amp; scores</h2>
        <button type="button" aria-label="Close team import" class="close" disabled={applying || reading} on:click={close}><Icon name="close" size={20} /></button>
      </header>
      <div class="import-card crm-auth-card">
        <div class="import-content">
        {#if fileName}<div class="crm-ui-label">CSV file</div>{/if}
        <div class="file-picker">
          {#if fileName}<span class="filename" title={fileName}>{fileName}</span>{/if}
          {#if !attempting}
            <label class="choose-file" class:crm-auth-link={fileName} class:crm-ui-button-primary={!fileName}>
              <span aria-hidden="true">{fileName ? 'Replace CSV' : 'Choose CSV'}</span>
              <input type="file" aria-label={fileName ? 'Replace CSV file' : 'Choose CSV file'} accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={reading || applying} on:change={chooseFile} />
            </label>
          {/if}
        </div>
        {#if reading}<p role="status">Reading CSV…</p>{/if}
        {#if table}
          {#if table.skippedPreamble}
            <p>Report headings skipped</p>
          {/if}
          {#if scoreSelectionRequired}
            <h3>Choose a score column</h3>
          {:else if showTitle}
            <div class="title-field">
              <label for="team-import-title-value" class="crm-ui-label">Scoring event title</label>
              <input id="team-import-title-value" class="crm-ui-input" type="text" maxlength="80"
                placeholder="e.g. BOLT Challenge 1" value={importTitle} disabled={attempting || applying}
                aria-required="true"
                on:input={event => { importTitle = event.currentTarget.value; titleEdited = true; review(true); }} />
            </div>
          {/if}
          <div class="review-heading">
            {#if rows.length}
              <h3>{existingScores && !newTeams ? `${existingScores} matched team${existingScores === 1 ? '' : 's'}` : 'Review teams'}</h3>
            {/if}
          {#if !attempting}
            <button class="columns-toggle crm-auth-link" type="button" aria-expanded={editColumns}
              aria-controls="team-import-columns" disabled={applying}
              on:click={() => { editColumns = !editColumns; }}>
              {editColumns ? 'Done editing columns' : 'Edit columns'}
            </button>
          {/if}
          </div>
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
            {#if attempting || rows.some(row => row.issue)}
              <p role="status">{pending.length} ready · {imported} imported · {rows.length - pending.length - imported} skipped</p>
            {/if}
            {#if newTeams}<p>{newTeams} new team{newTeams === 1 ? '' : 's'}</p>{/if}
            {#if resultCount > 1}<p>{resultCount} result groups</p>{/if}
            <div class="row-list" aria-label="Team import preview">
              <div class="row-heading"><span>Team</span>{#if scoreMode}<span>Score</span>{/if}</div>
              {#each (showAllRows ? rows : rows.slice(0, 3)) as row (row.line)}
                {@const status = row.issue || ({ ready: '', importing: 'Importing…', imported: 'Imported', duplicate: 'Already exists in this program', retry: 'Retry needed' })[row.status]}
                <div class="row">
                  {#if showAllRows && !row.issue && (row.status === 'ready' || row.status === 'retry')}
                    <input type="checkbox" aria-label={`Import row ${row.line}: ${row.name}`} checked={row.selected} disabled={applying || (scoreMode && attempting)}
                      on:change={(event) => updateRow(row.line, { selected: event.currentTarget.checked })} />
                  {/if}
                  <strong>{row.name || 'Unnamed team'}</strong>
                  {#if scoreMode}<span class="score">{Number.isFinite(row.score) ? row.score : '—'}</span>{/if}
                  {#if isScoreRow(row) && (showAllRows || resultCount > 1)}
                    {@const eventTitle = events.find(event => event.id === row.eventId)?.title}
                    <small>{row.teamId ? 'Existing team' : 'New team'}{!row.usesImportTitle ? ` · ${row.title}` : ''}{row.division && row.division !== row.title ? ` · ${row.division}` : ''}{eventTitle && eventTitle !== row.title ? ` · ${eventTitle}` : ''}</small>
                  {/if}
                  {#if status}<small>Row {row.line} · {status}</small>{/if}
                </div>
              {/each}
            </div>
            {#if rows.length > 3}
              <button type="button" class="all-teams crm-auth-link" aria-expanded={showAllRows}
                on:click={() => { showAllRows = !showAllRows; }}>
                {showAllRows ? 'Show fewer teams' : `Show all ${rows.length} teams`}
              </button>
            {/if}
          {/if}
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
      <footer>
        {#if applying}
          <button type="button" class="crm-ui-button-secondary" disabled={stopRequested} on:click={() => stopRequested = true}>{stopRequested ? 'Stopping…' : scoreMode ? 'Stop after this result group' : 'Stop after this row'}</button>
        {:else if attempting && !pending.length}
          <button type="button" class="crm-ui-button-secondary" disabled={reading} on:click={close}>{attempting ? 'Done' : 'Close'}</button>
        {/if}
        {#if table && (pending.length || applying)}
          <button type="button" class="crm-ui-button-primary" disabled={applying || missingTitle} on:click={applyImport}>{applying ? 'Importing…' : pendingScores.length ? `Publish ${pendingScores.length} score${pendingScores.length === 1 ? '' : 's'}` : `Import ${pending.length} team${pending.length === 1 ? '' : 's'}`}</button>
        {/if}
      </footer>
      </div>
    </div>
  </div>
</div>
