<script lang="ts">
  import type { AppVersion } from './appConfigurationDraft';

  export let versions: AppVersion[] = [];
  export let state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  export let currentVersion = 0;
  export let truncated = false;
  export let disabled = false;
  export let onRetry: () => void;
  export let onUseVersion: (version: AppVersion) => void;
</script>

<div class="space-y-4">
  <div>
    <h3 class="font-semibold text-gray-900">Published versions</h3>
    <p class="mt-1 text-sm text-gray-600">Load an earlier configuration as a draft, inspect it in the mobile preview, then use the normal reviewed publish flow to roll back safely.</p>
  </div>
  {#if state === 'loading'}
    <p role="status" class="text-sm text-gray-500">Loading version history…</p>
  {:else if state === 'error'}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Version history could not be loaded. <button type="button" class="font-semibold underline" on:click={onRetry}>Retry</button></div>
  {:else if versions.length === 0}
    <p class="rounded-md border bg-white p-4 text-sm text-gray-600">No portal-published versions are retained yet. The next publication will start this history.</p>
  {:else}
    <ul class="divide-y rounded-lg border bg-white">
      {#each versions as version}
        <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-semibold">Version {version.configVersion}{version.configVersion === currentVersion ? ' · Current' : ''}</p>
            <p class="text-xs text-gray-500">{version.publishedAt ? new Date(version.publishedAt).toLocaleString() : 'Time unavailable'} · {version.publishedByLabel || (version.publishedBy ? 'Portal administrator' : 'Publisher unavailable')}</p>
          </div>
          <button type="button" class="crm-ui-button-secondary" disabled={version.configVersion === currentVersion || disabled} on:click={() => onUseVersion(version)}>Use as rollback draft</button>
        </li>
      {/each}
    </ul>
    {#if truncated}<p class="text-xs text-amber-800">Showing the 20 most recent retained versions.</p>{/if}
  {/if}
</div>
