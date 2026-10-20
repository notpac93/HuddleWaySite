<script lang="ts">
  import { registrationsProjectionScope, refreshOperationalCollections } from '../../../lib/services/DataStore';
</script>

{#if $registrationsProjectionScope.loading}
  <p class="crm-ui-notice mb-3" role="status">Loading participant names…</p>
{:else if $registrationsProjectionScope.error || $registrationsProjectionScope.truncated}
  <div class="crm-ui-danger mb-3" role="alert">
    <p>Participant names could not be fully loaded. {$registrationsProjectionScope.error}</p>
    <button type="button" class="crm-ui-detail-retry" on:click={() => refreshOperationalCollections('registrations')}>Retry participant names</button>
  </div>
{/if}
