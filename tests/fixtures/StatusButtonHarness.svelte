<script lang="ts">
  import StatusButton from '../../src/components/crm/ui/StatusButton.svelte';

  export let state: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let clickCount = 0;
</script>

<StatusButton
  {state}
  idleText="Save"
  loadingText="Saving"
  successText="Saved"
  errorText="Try again"
  on:click={() => clickCount += 1}
/>
<output aria-label="click count">{clickCount}</output>
