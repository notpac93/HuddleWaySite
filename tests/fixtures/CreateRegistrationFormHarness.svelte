<script lang="ts">
  import CreateRegistrationForm from '../../src/components/crm/registration/CreateRegistrationForm.svelte';

  let open = true;
</script>

{#if open}
  <CreateRegistrationForm on:cancel={() => open = false} />
{/if}

<output aria-label="registration modal state">{open ? 'open' : 'closed'}</output>
