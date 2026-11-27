<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let organizationName: string;
  export let changes: string[] = [];
  export let tabOrder: string[] = [];
  export let blockedReason = '';
  export let previewUpdating = false;
  export let onCancel: () => void = () => {};
  export let onConfirm: () => void = () => {};
</script>

<div class="crm-ui-modal-root crm-ui-modal-centered" role="dialog" aria-modal="true" aria-labelledby="app-publish-review-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Close publish review" tabindex="-1" on:click={onCancel}></button>
  <div class="crm-ui-modal-centered-panel max-w-xl" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="px-5 pt-5 sm:px-6">
      <h2 id="app-publish-review-title" class="text-xl font-semibold text-gray-950">Publish app changes?</h2>
      <p class="mt-1 text-sm text-gray-600">Family app for <strong>{organizationName}</strong></p>
    </header>

    <div class="space-y-3 px-5 py-4 sm:px-6">
      {#if changes.length}
        <ul aria-label="Changes families will see" class="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
          {#each changes as change}
            <li class="whitespace-pre-wrap [overflow-wrap:anywhere] px-3 py-2 text-sm text-gray-900">{change}</li>
          {/each}
        </ul>
      {/if}
      {#if tabOrder.length}
        <p class="text-sm font-medium text-gray-700">Tab order after publishing</p>
        <ol aria-label="Tab order after publishing" class="flex flex-wrap gap-2">
          {#each tabOrder as label}
            <li class="crm-theme-selected max-w-full [overflow-wrap:anywhere] rounded-md px-2.5 py-1 text-sm">{label}</li>
          {/each}
        </ol>
      {/if}
      {#if blockedReason}
        <p class="text-sm text-red-800" role="status">{blockedReason}</p>
      {:else if previewUpdating}
        <p class="text-sm text-gray-600" role="status">The preview hasn’t caught up yet. The changes shown here are from your draft.</p>
      {:else if !changes.length && !tabOrder.length}
        <p class="text-sm text-gray-600">There are no changes to publish.</p>
      {/if}
    </div>

    <footer class="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 sm:px-6">
      <button type="button" class="crm-ui-button-secondary" on:click={onCancel}>Back to editing</button>
      <button type="button" class="crm-ui-button-primary" disabled={Boolean(blockedReason) || (!changes.length && !tabOrder.length)} on:click={onConfirm}>Publish changes</button>
    </footer>
  </div>
</div>
