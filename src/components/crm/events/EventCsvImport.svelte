<script lang="ts">
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { reviewEventCsv, type EventCsvReviewRow } from '../../../lib/ui/eventCsvImport';
  import ChangeReceipt from '../ui/ChangeReceipt.svelte';
  import Icon from '../ui/Icon.svelte';

  export let teams: Array<{ id: string; name: string }> = [];
  export let existingEvents: Array<Record<string, unknown>> = [];

  type ApplyRow = EventCsvReviewRow & {
    key: string;
    state: 'ready' | 'applying' | 'created' | 'failed';
    requestId: string;
  };

  let fileInput: HTMLInputElement | null = null;
  let selectedFileName = '';
  let rows: ApplyRow[] = [];
  let fileErrors: string[] = [];
  let reviewLoading = false;
  let applying = false;
  let importKey = '';
  let receiptVisible = false;

  $: validRows = rows.filter((row) => row.errors.length === 0);
  $: rejectedRows = rows.filter((row) => row.errors.length > 0);
  $: createdRows = rows.filter((row) => row.state === 'created');
  $: failedRows = rows.filter((row) => row.state === 'failed');
  $: pendingRows = rows.filter((row) => row.errors.length === 0 && ['ready', 'failed'].includes(row.state));

  async function selectFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || applying) return;
    reviewLoading = true;
    receiptVisible = false;
    selectedFileName = file.name;
    importKey = createIdempotencyKey('crm-event-csv-import');
    try {
      const review = reviewEventCsv(await file.text(), teams, existingEvents);
      fileErrors = review.fileErrors;
      rows = review.rows.map((row) => ({
        ...row,
        key: `${importKey}:${row.sourceLine}`,
        state: 'ready',
        requestId: '',
      }));
    } catch {
      fileErrors = ['The CSV could not be read. Save it as UTF-8 CSV and try again.'];
      rows = [];
    } finally {
      reviewLoading = false;
      input.value = '';
    }
  }

  async function applyImport() {
    const tenantId = $tenantIdStore;
    if (!tenantId || applying || !pendingRows.length) return;
    applying = true;
    receiptVisible = false;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const pending of pendingRows) {
      rows = rows.map((row) => row.key === pending.key ? { ...row, state: 'applying', requestId: '' } : row);
      try {
        const startAt = new Date(`${pending.dateKey}T${pending.startTime}:00`);
        const endAt = new Date(`${pending.dateKey}T${pending.endTime}:00`);
        await backendClient.createEventSeries(tenantId, {
          teamId: pending.teamId,
          title: pending.title,
          type: pending.type,
          occurrences: [{
            dateKey: pending.dateKey,
            startTime: pending.startTime,
            endTime: pending.endTime,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            timeZone,
          }],
          location: pending.location,
          notes: pending.notes,
          seasonId: null,
          registrationFormId: null,
          publishMode: 'draft',
        }, `Import event draft from CSV line ${pending.sourceLine}.`, pending.key);
        rows = rows.map((row) => row.key === pending.key ? { ...row, state: 'created' } : row);
      } catch (error) {
        rows = rows.map((row) => row.key === pending.key ? {
          ...row,
          state: 'failed',
          requestId: error instanceof BackendApiError ? error.requestId || '' : '',
        } : row);
      }
    }
    applying = false;
    receiptVisible = true;
  }

  function resetReview() {
    if (applying) return;
    rows = [];
    fileErrors = [];
    selectedFileName = '';
    receiptVisible = false;
    importKey = '';
  }

  function downloadSample() {
    const sample = 'title,date,start_time,end_time,team,type,location,notes\nPractice,2026-09-15,17:00,19:00,TEAM_ID,Practice,Main Field,Bring water\n';
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'huddleway-event-import-sample.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }
</script>

<section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="event-import-heading">
  <p class="text-xs font-semibold uppercase tracking-wide text-[var(--crm-brand-link)]">Bulk setup</p>
  <h3 id="event-import-heading" class="mt-1 text-lg font-semibold text-gray-900">Import event records</h3>
  <p class="mt-1 text-sm text-gray-600">Review every row before HuddleWay creates drafts. Team IDs or unique team names are accepted.</p>
  <div class="mt-4 flex flex-wrap gap-2">
    <label class="crm-ui-button-primary inline-flex cursor-pointer items-center gap-2"><Icon name="upload" size={16} /> Choose CSV<input bind:this={fileInput} class="sr-only" type="file" accept=".csv,text/csv" disabled={applying} on:change={selectFile} /></label>
    <button type="button" class="crm-ui-button-secondary inline-flex items-center gap-2" disabled={applying} on:click={downloadSample}><Icon name="download" size={16} /> Download sample</button>
  </div>

  {#if reviewLoading}<p class="mt-4 text-sm text-gray-600" role="status">Reviewing CSV…</p>{/if}
  {#if fileErrors.length}
    <div class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      {#each fileErrors as error}<p>{error}</p>{/each}
    </div>
  {/if}
  {#if rows.length}
    <div class="mt-5 border-t border-gray-200 pt-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h4 class="text-sm font-semibold text-gray-950">Review {selectedFileName}</h4><p class="mt-1 text-xs text-gray-600">{validRows.length} valid · {rejectedRows.length} rejected · {createdRows.length} created</p></div>
        <button type="button" class="crm-ui-button-secondary" disabled={applying} on:click={resetReview}>Clear review</button>
      </div>
      <div class="mt-3 max-h-80 overflow-auto rounded-lg border border-gray-200">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
          <thead class="sticky top-0 bg-gray-50"><tr><th class="px-3 py-2 text-left">Line</th><th class="px-3 py-2 text-left">Event</th><th class="px-3 py-2 text-left">Schedule</th><th class="px-3 py-2 text-left">Team</th><th class="px-3 py-2 text-left">Review</th></tr></thead>
          <tbody class="divide-y divide-gray-100">
            {#each rows as row (row.key)}
              <tr class={row.errors.length || row.state === 'failed' ? 'bg-red-50' : row.state === 'created' ? 'bg-emerald-50' : ''}>
                <td class="px-3 py-2 align-top">{row.sourceLine}</td><td class="px-3 py-2 align-top font-medium">{row.title || 'Missing title'}</td><td class="px-3 py-2 align-top">{row.dateKey} · {row.startTime}–{row.endTime}</td><td class="px-3 py-2 align-top">{row.teamName || 'Unresolved'}</td>
                <td class="px-3 py-2 align-top">{#if row.errors.length}<ul class="list-disc pl-4 text-xs text-red-800">{#each row.errors as error}<li>{error}</li>{/each}</ul>{:else if row.state === 'failed'}<span class="text-xs text-red-800">Not created{row.requestId ? ` · ${row.requestId}` : ''}</span>{:else if row.state === 'created'}<span class="text-xs font-semibold text-emerald-800">Draft created</span>{:else if row.state === 'applying'}<span class="text-xs text-gray-600">Creating…</span>{:else}<span class="text-xs font-semibold text-emerald-800">Ready</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex justify-end"><button type="button" class="crm-ui-button-primary" disabled={applying || !pendingRows.length} on:click={applyImport}>{applying ? 'Creating reviewed drafts…' : failedRows.length ? `Retry ${failedRows.length} failed row${failedRows.length === 1 ? '' : 's'}` : `Apply import · ${validRows.length} draft${validRows.length === 1 ? '' : 's'}`}</button></div>
    </div>
  {/if}
  {#if receiptVisible}
    <div class="mt-4"><ChangeReceipt status={failedRows.length ? 'partial' : 'success'} title={failedRows.length ? 'Import partially completed' : 'Import completed'} message={`${createdRows.length} draft${createdRows.length === 1 ? '' : 's'} created${failedRows.length ? `; ${failedRows.length} row${failedRows.length === 1 ? '' : 's'} can be retried.` : '.'}`} reference={importKey} onDismiss={() => receiptVisible = false} /></div>
  {/if}
</section>
