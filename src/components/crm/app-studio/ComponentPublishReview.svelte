<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let organizationName: string;
  export let changes: string[] = [];
  export let busy = false;
  export let onCancel: () => void;
  export let onConfirm: () => void;

  let confirmed = false;
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="component-publish-review-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Cancel component publication" tabindex="-1" disabled={busy} on:click={onCancel}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6">
      <p class="crm-theme-link text-xs font-semibold uppercase tracking-wide">Final review</p>
      <h2 id="component-publish-review-title" class="mt-1 text-xl font-semibold text-gray-950">Publish component changes?</h2>
      <p class="mt-1 text-sm text-gray-600">Families using <strong>{organizationName}</strong> will receive these updates.</p>
    </header>
    <div class="space-y-5 p-6">
      <ul class="space-y-2" aria-label="Component changes">
        {#each changes as change}<li class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">{change}</li>{/each}
      </ul>
      <p class="text-xs text-gray-500">The server will reject this publication if another administrator changed the layout after you opened it.</p>
      <label class="flex items-start gap-3 rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800">
        <input type="checkbox" bind:checked={confirmed} disabled={busy} class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--crm-brand-link)]" />
        <span>I reviewed the component order, visibility, and content for <strong>{organizationName}</strong>.</span>
      </label>
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
      <button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button>
      <button type="button" class="crm-ui-button-primary" disabled={busy || !confirmed || changes.length === 0} on:click={onConfirm}>{busy ? 'Publishing…' : 'Confirm and publish'}</button>
    </footer>
  </div>
</div>
