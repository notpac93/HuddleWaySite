<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let organizationName: string;
  export let changes: string[] = [];
  export let busy = false;
  export let onCancel: () => void;
  export let onConfirm: () => void;

</script>

<div class="crm-ui-modal-root crm-ui-modal-centered" role="dialog" aria-modal="true" aria-labelledby="component-publish-review-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Cancel component publication" tabindex="-1" disabled={busy} on:click={onCancel}></button>
  <div class="crm-ui-modal-centered-panel max-w-xl" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6">
      <h2 id="component-publish-review-title" class="mt-1 text-xl font-semibold text-gray-950">Review your changes</h2>
      <p class="mt-1 text-sm text-gray-600">Families using <strong>{organizationName}</strong> will receive these updates.</p>
    </header>
    <div class="space-y-5 p-6">
      <ul class="space-y-2" aria-label="Component changes">
        {#each changes as change}<li class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">{change}</li>{/each}
      </ul>
      <p class="text-xs text-gray-500">The server will reject this publication if another administrator changed the layout after you opened it.</p>
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
      <button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button>
      <button type="button" class="crm-ui-button-primary" disabled={busy || changes.length === 0} on:click={onConfirm}>{busy ? 'Publishing…' : 'Publish all changes'}</button>
    </footer>
  </div>
</div>
