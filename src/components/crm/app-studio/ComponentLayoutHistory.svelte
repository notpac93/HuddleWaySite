<script lang="ts">
  import type { CrmComponentLayoutVersion } from '../../../lib/api/BackendApi';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let versions: CrmComponentLayoutVersion[] = [];
  export let currentVersionToken = '';
  export let truncated = false;
  export let onUse: (version: CrmComponentLayoutVersion) => void;
  export let onClose: () => void;
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="component-layout-history-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Close component layout history" tabindex="-1" on:click={onClose}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onClose }}>
    <header class="flex items-start justify-between gap-4 border-b border-gray-200 p-6">
      <div><h2 id="component-layout-history-title" class="text-xl font-semibold text-gray-950">Component layout history</h2><p class="mt-1 text-sm text-gray-600">Load a retained layout as a draft, inspect it in the live preview, then publish only after review.</p></div>
      <button type="button" class="rounded-md border px-3 py-2 text-sm" on:click={onClose}>Close</button>
    </header>
    <div class="space-y-3 p-6">
      {#if versions.length === 0}
        <p class="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No retained component layouts yet. The next component publication will retain both the previous and published layouts.</p>
      {:else}
        {#each versions as version}
          <article class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-4">
            <div><p class="text-sm font-semibold text-gray-900">{version.versionToken === currentVersionToken ? 'Current layout' : 'Retained layout'}</p><p class="mt-1 text-xs text-gray-500">{version.capturedAt ? new Date(version.capturedAt).toLocaleString() : 'Time unavailable'} · {version.pages.length} pages</p></div>
            <button type="button" class="crm-ui-button-secondary" disabled={version.versionToken === currentVersionToken} on:click={() => onUse(version)}>Use as rollback draft</button>
          </article>
        {/each}
        {#if truncated}<p class="text-xs text-amber-800">Showing the 20 most recently retained layouts.</p>{/if}
      {/if}
    </div>
  </div>
</div>
