<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import Papa from 'papaparse';
  import { modalFocus } from '../../lib/ui/modalFocus';

  type Row = Record<string, any>;
  type Column = {
    key: string;
    label: string;
    sortable?: boolean;
    align?: 'left' | 'right';
  };

  const dispatch = createEventDispatcher();

  export let data: Row[] = [];
  export let columns: Column[] = [];
  export let searchable = true;
  export let filterable = false;
  export let filterExpanded = false;
  export let searchPlaceholder = 'Search records';
  export let exportable = true;
  export let exportFilename = 'export';
  export let selectable = false;
  export let rowKey = 'id';
  export let pageSize = 25;
  export let loading = false;
  export let error = '';
  export let truncated = false;
  export let truncationMessage =
    'This table is a limited projection. Search, selection, counts, and exports apply only to the loaded records.';
  export let permissionDenied = false;
  export let emptyMessage = 'No records are available yet.';
  export let noResultsMessage = 'No records match the current search or filters.';
  export let permissionMessage = 'You do not have permission to view these records.';
  export let activeRowId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};

  let sortColumn = columns.length > 0 ? columns[0].key : '';
  let sortDirection: 'asc' | 'desc' = 'asc';
  let searchQuery = '';
  let currentPage = 1;
  let selectedRows = new Set<string>();
  let knownDataIds = '';
  let consumedTargetId = '';
  let tableRegion: HTMLElement;
  let selectAllCheckbox: HTMLInputElement;
  let exportReviewOpen = false;

  function stableId(row: Row): string {
    const value = row?.[rowKey];
    return value === null || value === undefined ? '' : String(value);
  }

  function searchableText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) return value.map(searchableText).join(' ');
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map(searchableText)
        .join(' ');
    }
    return '';
  }

  function emitSelection() {
    dispatch('selectionChange', Array.from(selectedRows));
  }

  export function clearSelection() {
    selectedRows = new Set();
    emitSelection();
  }

  function toggleRow(row: Row) {
    const id = stableId(row);
    if (!id) return;
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedRows = next;
    emitSelection();
  }

  function togglePage() {
    const next = new Set(selectedRows);
    if (currentPageIds.length > 0 && currentPageIds.every((id) => next.has(id))) {
      currentPageIds.forEach((id) => next.delete(id));
    } else {
      currentPageIds.forEach((id) => next.add(id));
    }
    selectedRows = next;
    emitSelection();
  }

  $: filteredAndSortedData = [...data]
    .filter((row) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return Object.values(row).some((value) =>
        searchableText(value).toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (!sortColumn) return 0;
      const valueA = a[sortColumn];
      const valueB = b[sortColumn];
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
      }
      const normalizedA = valueA === null || valueA === undefined
        ? ''
        : String(valueA).toLowerCase();
      const normalizedB = valueB === null || valueB === undefined
        ? ''
        : String(valueB).toLowerCase();
      return sortDirection === 'asc'
        ? normalizedA.localeCompare(normalizedB)
        : normalizedB.localeCompare(normalizedA);
    });

  $: totalPages = Math.max(1, Math.ceil(filteredAndSortedData.length / Math.max(1, pageSize)));
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: pageStart = (currentPage - 1) * Math.max(1, pageSize);
  $: pageRows = filteredAndSortedData.slice(pageStart, pageStart + Math.max(1, pageSize));
  $: currentPageIds = pageRows.map(stableId).filter(Boolean);
  $: currentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedRows.has(id));
  $: currentPagePartiallySelected =
    currentPageIds.some((id) => selectedRows.has(id)) && !currentPageSelected;
  $: if (selectAllCheckbox) selectAllCheckbox.indeterminate = currentPagePartiallySelected;
  $: selectedExportRows = filteredAndSortedData.filter(
    (row) => selectedRows.has(stableId(row)),
  );
  $: exportRows = selectedExportRows.length > 0 ? selectedExportRows : filteredAndSortedData;
  $: exportLabel = selectedExportRows.length > 0
    ? `Export ${selectedExportRows.length} selected`
    : `Export ${filteredAndSortedData.length} filtered`;
  $: rowIds = data.map(stableId);
  $: rowIdentityError =
    rowIds.some((id) => !id)
    || new Set(rowIds).size !== rowIds.length
      ? `Records cannot be displayed because ${rowKey} values are missing or duplicated.`
      : '';
  $: effectiveError = error || rowIdentityError;

  $: {
    const nextIds = data.map(stableId).filter(Boolean);
    const signature = JSON.stringify(nextIds);
    if (signature !== knownDataIds) {
      knownDataIds = signature;
      const allowed = new Set(nextIds);
      const retained = new Set(Array.from(selectedRows).filter((id) => allowed.has(id)));
      if (retained.size !== selectedRows.size) {
        selectedRows = retained;
        emitSelection();
      }
    }
  }

  async function revealActiveRow(targetId: string) {
    searchQuery = '';
    await tick();
    const targetIndex = filteredAndSortedData.findIndex(
      (row) => stableId(row) === targetId,
    );
    if (targetIndex < 0) return;

    currentPage = Math.floor(targetIndex / Math.max(1, pageSize)) + 1;
    await tick();
    const candidates = tableRegion?.querySelectorAll<HTMLElement>('[data-record-id]');
    const target = Array.from(candidates || [])
      .find((candidate) => candidate.dataset.recordId === targetId);
    target?.scrollIntoView?.({ block: 'center' });
    (target?.querySelector<HTMLElement>('button, input, [tabindex]') || target)?.focus();
    onTargetConsumed(targetId);
  }

  $: if (activeRowId && activeRowId !== consumedTargetId) {
    if (data.some((row) => stableId(row) === activeRowId)) {
      consumedTargetId = activeRowId;
      void revealActiveRow(activeRowId);
    }
  }
  $: if (!activeRowId) consumedTargetId = '';

  function handleSearchInput() {
    currentPage = 1;
    if (selectedRows.size > 0) clearSelection();
  }

  function handleSort(column: Column) {
    if (column.sortable === false) return;
    if (sortColumn === column.key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column.key;
      sortDirection = 'asc';
    }
    currentPage = 1;
  }

  function exportCSV() {
    if (exportRows.length === 0) return;
    const exportData = exportRows.map((row) => {
      const exportRow: Record<string, unknown> = {};
      columns.forEach((column) => {
        if (column.key !== 'actions' && column.label) {
          exportRow[column.label] = row[column.key] ?? '';
        }
      });
      return exportRow;
    });

    const csv = Papa.unparse(exportData, { escapeFormulae: true });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${exportFilename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    exportReviewOpen = false;
  }
</script>

{#if exportReviewOpen}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="table-export-review-title"><button type="button" class="crm-ui-backdrop" aria-label="Cancel export" tabindex="-1" on:click={() => exportReviewOpen = false}></button><div class="relative z-10 mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-lg rounded-lg bg-white p-6 shadow-xl" tabindex="-1" use:modalFocus={{ onEscape: () => exportReviewOpen = false, initialFocusSelector: '[data-export-cancel]' }}><h2 id="table-export-review-title" class="text-lg font-semibold text-gray-950">Review CSV export</h2><p class="mt-2 text-sm text-gray-600">{exportRows.length} {selectedExportRows.length ? 'selected' : 'filtered'} record{exportRows.length === 1 ? '' : 's'} will be downloaded.</p><p class="mt-3 text-sm"><strong>Scope:</strong> {selectedExportRows.length ? 'Selected records across all table pages' : 'All records matching the current search, filters, and sort order'}</p><p class="mt-1 text-sm"><strong>Columns:</strong> {columns.filter((column) => column.label && column.key !== 'actions').map((column) => column.label).join(', ')}</p><p class="mt-1 text-xs text-gray-500">Filename: {exportFilename}_{new Date().toISOString().split('T')[0]}.csv · Generated {new Date().toLocaleString()}</p>{#if truncated}<p class="mt-3 text-sm text-amber-800">Only loaded records can be exported because this projection is limited.</p>{/if}<div class="mt-6 flex justify-end gap-3"><button type="button" data-export-cancel class="crm-ui-button-secondary" on:click={() => exportReviewOpen = false}>Cancel</button><button type="button" class="crm-ui-button-primary" on:click={exportCSV}>Download CSV</button></div></div></div>
{/if}

<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
    {#if searchable}
      <label class="min-w-0 sm:w-64">
        <span class="sr-only">Search table records</span>
        <input
          type="search"
          bind:value={searchQuery}
          on:input={handleSearchInput}
          placeholder={searchPlaceholder}
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[var(--crm-brand-border)] focus:outline-none focus:ring-[var(--crm-brand-focus)]"
        />
      </label>
      {#if filterable}
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-md bg-[var(--crm-brand-control)] px-3 py-2 text-sm font-medium text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)]"
          aria-expanded={filterExpanded}
          on:click={() => dispatch('filter')}
        >
          <svg class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
        </button>
      {/if}
    {/if}
    <slot name="filters"></slot>
  </div>
  <div class="flex flex-wrap gap-3">
    {#if exportable}
      <button
        type="button"
        on:click={() => exportReviewOpen = true}
        disabled={exportRows.length === 0 || loading || permissionDenied || Boolean(effectiveError)}
        title={exportRows.length === 0 ? 'There are no records in the stated export scope.' : undefined}
        class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg class="mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {exportLabel}
      </button>
    {/if}
    <slot name="actions"></slot>
  </div>
</div>

<div bind:this={tableRegion} class="mt-4">
  {#if truncated && !loading && !permissionDenied && !effectiveError}
    <div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      {truncationMessage}
    </div>
  {/if}
  {#if loading}
    <div class="crm-ui-empty" role="status">
      Loading records…
    </div>
  {:else if permissionDenied}
    <div class="rounded-lg border border-amber-200 bg-amber-50 px-6 py-10 text-center text-sm text-amber-900" role="status">
      {permissionMessage}
    </div>
  {:else if effectiveError}
    <div class="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-800" role="alert">
      {effectiveError}
    </div>
  {:else if data.length === 0}
    <div class="crm-ui-empty" role="status">
      {emptyMessage}
    </div>
  {:else if filteredAndSortedData.length === 0}
    <div class="crm-ui-empty" role="status">
      {noResultsMessage}
    </div>
  {:else}
    <div class="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm md:block">
      <table class="crm-ui-table">
        <thead class="bg-gray-50">
          <tr>
            {#if selectable}
              <th scope="col" class="w-12 px-6 py-3 text-left">
                <input
                  bind:this={selectAllCheckbox}
                  type="checkbox"
                  aria-label="Select all records on this page"
                  class="h-4 w-4 cursor-pointer rounded border-gray-300 text-[var(--crm-brand-link)] focus:ring-[var(--crm-brand-focus)]"
                  checked={currentPageSelected}
                  on:change={togglePage}
                />
              </th>
            {/if}
            {#each columns as column}
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                {#if column.sortable !== false}
                  <button
                    type="button"
                    class="flex w-full items-center {column.align === 'right' ? 'justify-end' : ''} hover:text-gray-900"
                    aria-label={`Sort by ${column.label}${sortColumn === column.key ? `, currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                    on:click={() => handleSort(column)}
                  >
                    {column.label}
                    {#if sortColumn === column.key}
                      <span class="ml-1" aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                {:else}
                  <span class="block {column.align === 'right' ? 'text-right' : ''}">{column.label}</span>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          {#each pageRows as row (stableId(row))}
            <tr
              data-record-id={stableId(row)}
              class="hover:bg-gray-50 {selectedRows.has(stableId(row)) ? 'crm-theme-selected' : ''} {activeRowId === stableId(row) ? 'ring-2 ring-inset ring-[var(--crm-brand-focus)]' : ''}"
              tabindex="-1"
            >
              {#if selectable}
                <td class="w-12 whitespace-nowrap px-6 py-4">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.name || row.title || stableId(row)}`}
                    class="h-4 w-4 cursor-pointer rounded border-gray-300 text-[var(--crm-brand-link)] focus:ring-[var(--crm-brand-focus)]"
                    checked={selectedRows.has(stableId(row))}
                    on:change={() => toggleRow(row)}
                  />
                </td>
              {/if}
              {#each columns as column}
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 {column.align === 'right' ? 'text-right' : ''}">
                  <slot name="cell" {row} {column}>{row[column.key]}</slot>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="space-y-3 md:hidden">
      {#each pageRows as row (stableId(row))}
        <article
          data-record-id={stableId(row)}
          class="rounded-lg border bg-white p-4 shadow-sm {selectedRows.has(stableId(row)) ? 'crm-theme-selected' : 'border-gray-200'} {activeRowId === stableId(row) ? 'ring-2 ring-[var(--crm-brand-focus)]' : ''}"
          tabindex="-1"
        >
          {#if selectable}
            <label class="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-[var(--crm-brand-link)] focus:ring-[var(--crm-brand-focus)]"
                checked={selectedRows.has(stableId(row))}
                on:change={() => toggleRow(row)}
              />
              Select {row.name || row.title || stableId(row)}
            </label>
          {/if}
          <dl class="space-y-3">
            {#each columns as column}
              <div class="grid grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] gap-3">
                <dt class="text-xs font-semibold uppercase tracking-wide text-gray-500">{column.label || 'Actions'}</dt>
                <dd class="min-w-0 break-words text-sm text-gray-900 {column.align === 'right' ? 'text-right' : ''}">
                  <slot name="cell" {row} {column}>{row[column.key]}</slot>
                </dd>
              </div>
            {/each}
          </dl>
        </article>
      {/each}
    </div>

    <div class="mt-4 flex flex-col gap-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {pageStart + 1}–{Math.min(pageStart + pageRows.length, filteredAndSortedData.length)}
        of {filteredAndSortedData.length} matching records
        {#if selectedRows.size > 0} · {selectedRows.size} selected{/if}
      </p>
      {#if totalPages > 1}
        <nav class="flex items-center gap-2" aria-label="Table pagination">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
            disabled={currentPage === 1}
            on:click={() => currentPage -= 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-50"
            disabled={currentPage === totalPages}
            on:click={() => currentPage += 1}
          >
            Next
          </button>
        </nav>
      {/if}
    </div>
  {/if}
</div>
