<script lang="ts">
  import CreateEventForm from '../../src/components/crm/events/CreateEventForm.svelte';

  let open = true;
</script>

{#if open}
  <CreateEventForm on:cancel={() => open = false} />
{/if}

<output aria-label="event modal state">{open ? 'open' : 'closed'}</output>
