<script lang="ts">
  import RecurrenceSelector from '../../src/components/crm/events/RecurrenceSelector.svelte';

  let selectedDateKeys: string[] = [];
</script>

<RecurrenceSelector bind:selectedDateKeys />
<output aria-label="selected recurrence dates">{selectedDateKeys.join(',')}</output>
