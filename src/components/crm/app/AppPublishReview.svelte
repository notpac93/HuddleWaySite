<script lang="ts">
  import type { CrmAppConfiguration } from '../../../lib/api/BackendApi';
  import { readableTextColor } from '../../../lib/ui/appConfigurationReview';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';

  export let organizationName: string;
  export let versionLabel: string;
  export let changes: string[] = [];
  export let configuration: CrmAppConfiguration;
  export let busy = false;
  export let onCancel: () => void = () => {};
  export let onConfirm: () => void = () => {};

  let targetConfirmed = false;
  const colorRoles = [
    { key: 'primaryColor', label: 'Primary', use: 'Primary actions and prominent brand surfaces' },
    { key: 'secondaryColor', label: 'Secondary', use: 'Supporting accents and secondary surfaces' },
    { key: 'tertiaryColor', label: 'Tertiary', use: 'Additional highlights and decorative accents' },
  ] as const;
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="app-publish-review-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Cancel app publication" tabindex="-1" disabled={busy} on:click={onCancel}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6">
      <h2 id="app-publish-review-title" class="text-xl font-semibold text-gray-950">Review family app publication</h2>
      <p class="mt-1 text-sm text-gray-600">Target: <strong>{organizationName}</strong> · {versionLabel}</p>
    </header>
    <div class="space-y-6 p-6">
      <section aria-labelledby="app-change-summary-title">
        <h3 id="app-change-summary-title" class="text-sm font-semibold text-gray-950">Changes families will receive</h3>
        {#if changes.length > 0}
          <ul class="mt-3 space-y-2">
            {#each changes as change}
              <li class="flex gap-2 text-sm text-gray-700"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-emerald-700" /> <span>{change}</span></li>
            {/each}
          </ul>
        {:else}
          <p class="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            No publishable changes were detected. Return to editing and review the draft.
          </p>
        {/if}
      </section>
      <section aria-labelledby="app-color-review-title">
        <h3 id="app-color-review-title" class="text-sm font-semibold text-gray-950">Color readability</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          {#each colorRoles as role}
            {@const result = readableTextColor(configuration[role.key])}
            <div class="rounded-lg border border-gray-200 p-3">
              <div class="flex h-12 items-center justify-center rounded-md text-sm font-semibold" style={`background:${configuration[role.key]};color:${result.color}`}>{role.label}</div>
              <p class="mt-2 text-xs text-gray-600">{role.use}</p>
              <p class="mt-1 text-xs font-semibold {result.ratio >= 4.5 ? 'text-emerald-700' : 'text-amber-800'}">Best text contrast {result.ratio.toFixed(2)}:1 {result.ratio >= 4.5 ? '· AA pass' : '· review required'}</p>
            </div>
          {/each}
        </div>
      </section>
      <label class="flex items-start gap-3 rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800">
        <input type="checkbox" bind:checked={targetConfirmed} disabled={busy} class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--crm-brand-link)]" />
        <span>I confirm these changes should be published to <strong>{organizationName}</strong>.</span>
      </label>
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
      <button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button>
      <button type="button" class="crm-ui-button-primary" disabled={busy || !targetConfirmed || changes.length === 0} on:click={onConfirm}>{busy ? 'Publishing…' : 'Confirm and publish'}</button>
    </footer>
  </div>
</div>
