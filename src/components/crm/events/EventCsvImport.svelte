<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { reviewEventCsv, type EventCsvReviewRow } from '../../../lib/ui/eventCsvImport';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  export let teams: Array<{ id: string; name: string }> = [];
  export let existingEvents: Array<Record<string, unknown>> = [];
  export let onClose: () => void = () => {};
  const dispatch = createEventDispatcher();
  const tenant = $tenantIdStore;
  type ApplyRow = EventCsvReviewRow & { key: string; state: 'ready' | 'applying' | 'created' | 'failed'; requestId: string };
  let rows: ApplyRow[] = [];
  let fileErrors: string[] = [];
  let selectedFileName = '';
  let reviewLoading = false;
  let applying = false;
  let step = 1;
  let generation = 0;
  let alive = true;
  onDestroy(() => { alive = false; generation++; });
  $: if ($tenantIdStore !== tenant && !applying) onClose();
  $: validRows = rows.filter(row => !row.errors.length);
  $: rejectedRows = rows.filter(row => row.errors.length);
  $: createdRows = rows.filter(row => row.state === 'created');
  $: failedRows = rows.filter(row => row.state === 'failed');
  $: pendingRows = validRows.filter(row => ['ready','failed'].includes(row.state));

  async function selectFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || applying || $tenantIdStore !== tenant) return;
    const operation = ++generation;
    rows = []; fileErrors = []; reviewLoading = true; selectedFileName = file.name;
    try {
      if (file.size > 2 * 1024 * 1024) { fileErrors = ['Use a CSV smaller than 2 MB.']; return; }
      const source = await file.text();
      if (!alive || operation !== generation || $tenantIdStore !== tenant) return;
      const result = reviewEventCsv(source, teams, existingEvents);
      fileErrors = result.fileErrors;
      const key = createIdempotencyKey('crm-event-csv-import');
      rows = result.rows.map(row => ({ ...row, key: `${key}:${row.sourceLine}`, state: 'ready', requestId: '' }));
      if (!fileErrors.length) step = 2;
    } catch { if (alive && operation === generation) fileErrors = ['The CSV could not be read. Use UTF-8 CSV and try again.']; }
    finally { if (alive && operation === generation) reviewLoading = false; input.value = ''; }
  }
  async function applyImport() {
    if (!tenant || $tenantIdStore !== tenant || applying || !pendingRows.length) return;
    const pending = [...pendingRows]; const operation = generation;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) { fileErrors = ['Your time zone is unavailable. Reload and try again.']; return; }
    applying = true;
    try {
      for (const row of pending) {
        if (!alive || operation !== generation || $tenantIdStore !== tenant) return;
        rows = rows.map(value => value.key === row.key ? { ...value, state: 'applying', requestId: '' } : value);
        try {
          await backendClient.createEventSeries(tenant, {
            teamId: row.teamId, title: row.title, type: row.type,
            occurrences: [{ dateKey: row.dateKey, startTime: row.startTime, endTime: row.endTime, startAt: new Date(`${row.dateKey}T${row.startTime}:00`).toISOString(), endAt: new Date(`${row.dateKey}T${row.endTime}:00`).toISOString(), timeZone }],
            location: row.location, notes: row.notes, seasonId: null, registrationFormId: null, publishMode: 'draft',
          }, `Import event draft from CSV line ${row.sourceLine}.`, row.key);
          if (!alive || operation !== generation || $tenantIdStore !== tenant) return;
          rows = rows.map(value => value.key === row.key ? { ...value, state: 'created' } : value);
        } catch (error) {
          if (!alive || operation !== generation || $tenantIdStore !== tenant) return;
          rows = rows.map(value => value.key === row.key ? { ...value, state: 'failed', requestId: error instanceof BackendApiError ? error.requestId || '' : '' } : value);
        }
      }
      if (!rows.some(row => row.state === 'failed')) dispatch('success', { created: rows.filter(row => row.state === 'created').length, rejected: rejectedRows.length });
    } finally { if (alive) applying = false; }
  }
  function downloadSample() {
    const team = JSON.stringify(teams[0]?.id || 'TEAM_ID').replaceAll('\\"','""');
    const sample = `title,date,start_time,end_time,team,type,location,notes\nPractice,2030-09-15,17:00,19:00,${team},Practice,Main Field,Bring water\n`;
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'huddleway-event-import-sample.csv'; anchor.click(); URL.revokeObjectURL(url);
  }
</script>

<div class="import-overlay" role="presentation">
  <div class="import-panel" role="dialog" aria-modal="true" aria-label="Import events" tabindex="-1" use:modalFocus={{ onEscape: () => { if (!applying) onClose(); } }}>
    <header><h2>Import events</h2><button type="button" disabled={applying} aria-label="Close import" on:click={onClose}>×</button></header>
    <div class="import-steps" aria-label="Import steps"><span aria-current={step === 1 ? 'step' : undefined}>Upload</span><span aria-current={step === 2 ? 'step' : undefined}>Preview & import</span></div>
    {#if step === 1}
      <h3>CSV requirements</h3>
      <p class="label">Required columns</p><div class="columns">{#each ['title','date','start_time','end_time','team'] as column}<code>{column}</code>{/each}</div>
      <p class="label">Optional columns</p><div class="columns">{#each ['type','location','notes'] as column}<code>{column}</code>{/each}</div>
      <ul class="requirements"><li>Date: YYYY-MM-DD · Time: HH:MM (24-hour)</li><li>Team: exact team ID or unique name</li><li>Up to 200 events · 2 MB · UTF-8 CSV</li></ul>
      <button type="button" class="text-button" on:click={downloadSample}>Download sample CSV</button>
      <label class="upload"><strong>Choose CSV</strong><input type="file" aria-label="Choose CSV" accept=".csv,text/csv" disabled={reviewLoading} on:change={selectFile} /></label>
      {#if reviewLoading}<p role="status">Reviewing CSV…</p>{/if}
      <div class="footer"><button type="button" class="secondary" on:click={onClose}>Cancel</button></div>
    {:else}
      <div class="preview-heading"><div><h3>{selectedFileName}</h3><p>{validRows.length} valid · {rejectedRows.length} rejected · {createdRows.length} created</p></div><button type="button" class="text-button" disabled={applying || createdRows.length > 0} on:click={() => { generation++; step = 1; rows = []; fileErrors = []; }}>Change CSV</button></div>
      <p class="draft-note">Events will be imported as drafts.</p>
      <div class="row-list" aria-label="CSV preview">{#each rows as row (row.key)}<article class:rejected={row.errors.length > 0 || row.state === 'failed'}><div class="row-heading"><strong>{row.title || 'Missing title'}</strong><span>Line {row.sourceLine}</span></div><p>{row.dateKey} · {row.startTime}–{row.endTime}</p><p>{row.teamName || 'Unresolved team'}{row.location ? ` · ${row.location}` : ''}</p>{#if row.errors.length}<ul>{#each row.errors as error}<li>{error}</li>{/each}</ul>{:else if row.state === 'failed'}<p role="alert">Not imported. Retry this row.{row.requestId ? ` Reference: ${row.requestId}` : ''}</p>{:else}<span class="row-state">{row.state === 'created' ? 'Draft created' : row.state === 'applying' ? 'Importing…' : 'Ready'}</span>{/if}</article>{/each}</div>
      {#if rejectedRows.length}<p class="skip-note">{rejectedRows.length} rejected {rejectedRows.length === 1 ? 'row will' : 'rows will'} be skipped.</p>{/if}
      {#if createdRows.length}<p role="status">{createdRows.length} draft{createdRows.length === 1 ? '' : 's'} created.</p>{/if}
      <div class="footer"><button type="button" class="secondary" disabled={applying} on:click={onClose}>Cancel</button><button type="button" class="primary" disabled={applying || !pendingRows.length} on:click={applyImport}>{applying ? 'Importing…' : failedRows.length ? `Retry ${failedRows.length} failed ${failedRows.length === 1 ? 'row' : 'rows'}` : `Import ${pendingRows.length} draft${pendingRows.length === 1 ? '' : 's'}`}</button></div>
    {/if}
    {#if fileErrors.length}<div class="file-errors" role="alert">{#each fileErrors as error}<p>{error}</p>{/each}</div>{/if}
  </div>
</div>
<style>
  .import-overlay{position:fixed;inset:0;z-index:50;background:#15243a66;display:flex;align-items:center;justify-content:center;padding:12px}.import-panel{background:white;color:#182235;border-radius:16px;padding:20px 16px;width:min(100%,620px);max-height:calc(100dvh - 24px);overflow-y:auto;font:16px/1.4 Roboto,Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:24px;font-weight:600;margin:0}header button{width:44px;height:44px;background:none;border:0;font-size:26px;color:#607087}.import-steps{display:flex;gap:10px;margin:16px 0 24px}.import-steps span{flex:1;font-size:12px;color:#607087;border-bottom:2px solid #dce3ed;padding-bottom:8px}.import-steps [aria-current=step]{color:var(--crm-brand-link,#003366);border-color:var(--crm-brand-link,#003366)}h3{font-size:16px;font-weight:500;margin:0 0 10px;overflow-wrap:anywhere}.label{font-size:14px;font-weight:500;margin:16px 0 8px}.columns{display:flex;flex-wrap:wrap;gap:6px}.columns code{font-size:12px;padding:5px 7px;border-radius:6px;background:#eef2f7;color:#182235}.requirements{font-size:14px;color:#607087;padding-left:20px;line-height:1.7;margin:20px 0}.text-button{border:0;background:none;color:var(--crm-brand-link,#003366);font:inherit;font-size:14px;min-height:44px;padding:6px 0}.upload{display:grid;gap:12px;border:1px dashed #a3b4cc;border-radius:12px;padding:18px;margin-top:12px;background:#f8fafc;font-size:14px}.upload input{max-width:100%;font-size:16px}.upload strong{font-weight:500}.footer{display:flex;gap:10px;justify-content:flex-end;margin-top:22px;border-top:1px solid #dce3ed;padding-top:16px}.primary,.secondary{border:1px solid #dce3ed;border-radius:10px;padding:10px 12px;min-height:46px;font:inherit;font-size:16px}.secondary{background:white;color:#182235}.primary{background:var(--crm-brand-control,#003366);color:var(--crm-on-primary,white);border-color:var(--crm-brand-control,#003366)}button:disabled{opacity:.5}.preview-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}.preview-heading p,.draft-note,.skip-note{font-size:12px;color:#607087;margin:6px 0 14px}.row-list{display:grid;gap:10px}.row-list article{border:1px solid #dce3ed;border-radius:12px;padding:12px}.row-list article.rejected{border-color:#f1b5af;background:#fff8f7}.row-heading{display:flex;justify-content:space-between;align-items:start;gap:10px}.row-heading strong{font-size:16px;font-weight:500;overflow-wrap:anywhere}.row-heading>span{font-size:12px;white-space:nowrap;color:#607087}.row-list p{font-size:14px;margin:5px 0;color:#607087}.row-list ul,.row-list [role=alert],.file-errors{font-size:14px;color:#b42318}.row-state{display:block;font-size:12px;color:#237445;margin-top:8px}.file-errors p{margin:8px 0}
</style>
