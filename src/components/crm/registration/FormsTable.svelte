<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { DataStore, transactionsStore, invoicesStore, refundsStore, eventsStore } from '../../../lib/services/DataStore';
  import DataTable from '../DataTable.svelte';

  export let forms = [];
  export let isLoadingForms = true;
  export let activeTab = 'Active';
  export let error = '';
  export let truncated = false;
  export let limit = 500;

  const dispatch = createEventDispatcher();

  function openFormDetails(form) {
    dispatch('select', form);
  }

  $: {
    $transactionsStore;
    $invoicesStore;
    $refundsStore;
    $eventsStore;
  }

  function getFinancials(formId) {
    return DataStore.getRegistrationFormFinancials(formId);
  }

  function formatMoney(minorUnits: unknown, currency: string) {
    const amount = Number(minorUnits);
    if (!Number.isSafeInteger(amount)) return 'Invalid amount';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
  }

  function formatScopedMoney(row: any, key: 'totalCollected' | 'totalBalance') {
    if (row.financialRecordCount === 0) return 'No records';
    if (!row.financialTotalsAvailable || !row.financialCurrency) return 'Unavailable';
    return formatMoney(row[key], row.financialCurrency);
  }

  $: filteredForms = forms.filter((form) =>
    activeTab === 'Active'
      ? form.status === 'Open'
      : activeTab === 'Retired'
        ? form.status === 'Closed'
        : form.status !== 'Open' && form.status !== 'Closed'
  ).map(form => {
    const fin = getFinancials(form.id);
    return {
      ...form,
      totalCollected: fin.totalCollected,
      totalBalance: fin.totalBalance,
      financialTotalsAvailable: fin.totalsAvailable,
      financialCurrency: fin.currency,
      financialRecordCount: fin.financialRecordCount,
      financialScopeReason: fin.scopeReason,
    };
  });
</script>

<div class="mt-4">
    {#if truncated}
      <p class="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        Showing the first {limit} forms by record ID. Search, export, and totals apply only to this loaded set.
      </p>
    {/if}
    <DataTable
      data={filteredForms}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status' },
        { key: 'dateCreated', label: 'Date Created' },
        { key: 'program', label: 'Program' },
        { key: 'totalCollected', label: 'Collected', align: 'right' },
        { key: 'totalBalance', label: 'Balance', align: 'right' },
        { key: 'actions', label: '', sortable: false, align: 'right' }
      ]}
      exportFilename="registration_forms"
      searchPlaceholder="Search forms..."
      loading={isLoadingForms}
      {error}
      emptyMessage="No registration forms are available in this view."
      searchable={false}
      exportable={false}
    >
      <svelte:fragment slot="cell" let:row let:column>
        {#if column.key === 'name'}
          <button type="button" class="text-sm font-medium text-[#1855c5] hover:underline" on:click={() => openFormDetails(row)}>
            {row.name}
          </button>
        {:else if column.key === 'status'}
          <div class="flex items-center text-sm text-gray-700">
            <span class="w-2 h-2 rounded-full mr-2 {row.status === 'Open' || row.status === 'active' ? 'bg-[#73b62f]' : 'bg-gray-400'}"></span>
            {row.status}
          </div>
        {:else if column.key === 'dateCreated'}
          {row.dateCreated instanceof Date ? row.dateCreated.toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'}) : 'Unavailable'}
        {:else if column.key === 'totalCollected'}
          <span title={row.financialScopeReason}>{formatScopedMoney(row, 'totalCollected')}</span>
        {:else if column.key === 'totalBalance'}
          <span title={row.financialScopeReason}>{formatScopedMoney(row, 'totalBalance')}</span>
        {:else if column.key === 'actions'}
          <button type="button" class="text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-0.5" on:click={() => openFormDetails(row)}>
            Open details
          </button>
        {:else}
          {row[column.key] ?? 'Unavailable'}
        {/if}
      </svelte:fragment>
    </DataTable>
  </div>
