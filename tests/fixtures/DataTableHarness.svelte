<script lang="ts">
  import DataTable from '../../src/components/crm/DataTable.svelte';

  export let loading = false;
  export let error = '';
  export let permissionDenied = false;
  export let initialTarget: string | null = null;
  export let sortByAmount = false;

  let rows = [
    { id: 'row-1', name: 'Alpha', amount: 0 },
    { id: 'row-2', name: 'Bravo', amount: 20 },
    { id: 'row-3', name: 'Charlie', amount: 10 },
    { id: 'row-4', name: 'Delta', amount: 30 },
  ];
  let selectedIds: string[] = [];
  let activeRowId = initialTarget;
  let consumedTarget = '';
  let table: DataTable;

  function finishBulkMutation() {
    rows = rows.filter((row) => !selectedIds.includes(row.id));
    table.clearSelection();
  }

  function consumeTarget(id: string) {
    consumedTarget = id;
    activeRowId = null;
  }
</script>

<button type="button" on:click={finishBulkMutation} disabled={selectedIds.length === 0}>
  Complete bulk mutation
</button>
<output aria-label="selected stable ids">{selectedIds.join(',')}</output>
<output aria-label="consumed stable target">{consumedTarget}</output>

<DataTable
  bind:this={table}
  data={rows}
  columns={[
    ...(sortByAmount
      ? [{ key: 'amount', label: 'Amount' }, { key: 'name', label: 'Name' }]
      : [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount' }]),
  ]}
  selectable
  pageSize={2}
  exportFilename="fixture"
  {loading}
  {error}
  {permissionDenied}
  {activeRowId}
  onTargetConsumed={consumeTarget}
  on:selectionChange={(event) => selectedIds = event.detail}
/>
