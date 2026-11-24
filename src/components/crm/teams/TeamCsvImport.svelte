<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { BackendApiError } from '../../../lib/api/BackendApi';
  import { backendClient } from '../../../lib/api/backendClient';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import {
    readTeamCsv,
    reviewTeamCsv,
    teamCsvColumnLabel,
    teamCsvCreationIdentity,
    type TeamCsvReviewRow,
    type TeamCsvTable,
  } from '../../../lib/ui/teamCsvImport';
  import Icon from '../ui/Icon.svelte';

  export let teams: Array<{ id?: string; name?: string; title?: string }> = [];
  export let onClose: (imported: number) => void = () => {};

  type ImportRow = TeamCsvReviewRow & {
    selected: boolean;
    status: 'ready' | 'importing' | 'imported' | 'duplicate' | 'retry';
  };

  const tenant = $tenantIdStore;
  const existingTeams = [...teams];
  let alive = true;
  let fileName = '';
  let reading = false;
  let applying = false;
  let stopRequested = false;
  let error = '';
  let table: TeamCsvTable | null = null;
  let column: number | null = null;
  let hasHeader = false;
  let rows: ImportRow[] = [];

  onDestroy(() => { alive = false; });
  $: if ($tenantIdStore !== tenant) onClose(0);
  $: attempting = rows.some((row) => row.status !== 'ready');
  $: pending = rows.filter((row) => row.selected && ['ready', 'retry'].includes(row.status));
  $: imported = rows.filter((row) => row.status === 'imported').length;

  function close() {
    if (!applying && !reading) onClose(imported);
  }

  function review() {
    rows = table && column !== null ? reviewTeamCsv(table, column, hasHeader, existingTeams)
      .map((row) => ({ ...row, selected: !row.issue, status: 'ready' as const })) : [];
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
      hasHeader = table.suggestedColumn !== null;
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

  async function applyImport() {
    if (applying || !pending.length || !tenant || tenant !== $tenantIdStore) return;
    error = '';
    applying = true;
    stopRequested = false;
    try {
      for (const row of pending) {
        if (stopRequested || !alive || tenant !== $tenantIdStore) return;
        updateRow(row.line, { status: 'importing' });
        try {
          const identity = await teamCsvCreationIdentity(row.name);
          if (!alive || tenant !== $tenantIdStore) return;
          await backendClient.importTeamFromCsv(tenant, row.name, identity);
          if (!alive || tenant !== $tenantIdStore) return;
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
  <div class="crm-ui-modal-shell">
    <button type="button" class="crm-ui-backdrop" aria-label="Close team import" tabindex="-1" disabled={applying || reading} on:click={close}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="import-panel" tabindex="-1" use:modalFocus={{ onEscape: close }}>
      <header>
        <h2 id="team-import-title">Import teams from CSV</h2>
        <button type="button" aria-label="Close team import" class="close" disabled={applying || reading} on:click={close}><Icon name="close" size={20} /></button>
      </header>
      {#if !attempting}
        <label class="upload">
          <span>Choose a CSV file with one team per row.</span>
          <input type="file" aria-label="Choose CSV file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={reading || applying} on:change={chooseFile} />
        </label>
      {/if}
      {#if fileName}<p class="filename">{fileName}</p>{/if}
      {#if reading}<p role="status">Reading CSV…</p>{/if}
      {#if table}
        <fieldset disabled={attempting || applying}>
          <label for="team-import-column" class="crm-ui-label">Team name column</label>
          <select id="team-import-column" class="crm-ui-input" bind:value={column} on:change={review}>
            <option value={null}>Choose a column</option>
            {#each Array.from({ length: table.columnCount }, (_, index) => index) as index}
              <option value={index}>{teamCsvColumnLabel(table, index, hasHeader)}</option>
            {/each}
          </select>
          <label class="check"><input type="checkbox" bind:checked={hasHeader} on:change={review} /> First row contains column headers</label>
        </fieldset>
        {#if column === null}
          <p>Choose the column that contains the team names.</p>
        {:else if rows.length === 0}
          <p>There are no team names to review.</p>
        {:else}
          <p role="status">{pending.length} ready · {imported} imported · {rows.length - pending.length - imported} skipped</p>
          <div class="row-list" aria-label="Team import preview">
            {#each rows as row (row.line)}
              {@const status = row.issue || ({ ready: '', importing: 'Importing…', imported: 'Imported', duplicate: 'Already exists in this program', retry: 'Retry needed' })[row.status]}
              <div class="row">
                {#if !row.issue && (row.status === 'ready' || row.status === 'retry')}
                  <input type="checkbox" aria-label={`Import row ${row.line}: ${row.name}`} checked={row.selected} disabled={applying}
                    on:change={(event) => updateRow(row.line, { selected: event.currentTarget.checked })} />
                {/if}
                <strong>{row.name || 'Unnamed team'}</strong>
                <span>Row {row.line}{status ? ` · ${status}` : ''}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <footer>
        {#if applying}
          <button type="button" class="crm-ui-button-secondary" disabled={stopRequested} on:click={() => stopRequested = true}>{stopRequested ? 'Stopping after this row' : 'Stop after this row'}</button>
        {:else}
          <button type="button" class="crm-ui-button-secondary" disabled={reading} on:click={close}>{attempting ? 'Done' : 'Close'}</button>
        {/if}
        {#if table && (pending.length || applying)}
          <button type="button" class="crm-ui-button-primary" disabled={applying} on:click={applyImport}>{applying ? 'Importing…' : `Import ${pending.length} team${pending.length === 1 ? '' : 's'}`}</button>
        {/if}
      </footer>
    </div>
  </div>
</div>

<style>
  .import-panel { position: relative; display: inline-block; vertical-align: middle; width: min(100% - 24px, 640px); max-height: calc(100dvh - 24px); overflow: auto; margin: 12px; padding: 24px; border-radius: 16px; background: white; color: #182235; text-align: left; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
  h2 { margin: 0; font-size: 1.35rem; font-weight: 650; }
  .close { display: grid; place-items: center; min-width: 44px; min-height: 44px; color: #485870; }
  .upload { display: grid; gap: 8px; padding: 12px; border: 1px dashed #a3b4cc; border-radius: 10px; }
  .upload input { max-width: 100%; }
  .filename { margin: 8px 0; overflow-wrap: anywhere; color: #485870; }
  fieldset { margin-top: 16px; }
  select { width: 100%; }
  .check { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: .875rem; }
  p { margin: 10px 0; font-size: .9rem; }
  .row-list { display: grid; max-height: 38vh; overflow-y: auto; border: 1px solid #dce3ed; border-radius: 10px; }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 9px 12px; min-height: 44px; }
  .row + .row { border-top: 1px solid #dce3ed; }
  .row strong { min-width: 0; overflow-wrap: anywhere; }
  .row span { margin-left: auto; color: #485870; font-size: .875rem; }
  .error { color: #b42318; }
  footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 20px; }
</style>
