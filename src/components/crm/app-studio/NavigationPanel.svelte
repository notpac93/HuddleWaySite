<script lang="ts">
  import type { NavigationTabDraft } from './appConfigurationDraft';
  import { maxActiveTabs, permanentTabName } from './appConfigurationDraft';

  export let tabsConfig: NavigationTabDraft[] = [];
  export let disabled = false;
  export let duplicateLabels = false;
  export let activeContentCount: (tab: NavigationTabDraft) => number;
  export let onMove: (index: number, direction: -1 | 1) => void;

  $: activeTabCount = tabsConfig.filter((tab) => tab.enabled).length;

  function toggleTab(index: number) {
    tabsConfig[index].enabled = !tabsConfig[index].enabled;
    tabsConfig = tabsConfig;
  }
</script>

<div class="space-y-6">
  <div class="crm-ui-studio-modules">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="text-sm font-medium text-gray-900">App tabs</h3>
        <p class="mt-1 text-xs text-gray-500">The permanent name identifies the tab's purpose. You can rename the tab families see.</p>
      </div>
      <span class="rounded-full px-2.5 py-1 text-xs font-medium {activeTabCount > maxActiveTabs ? 'bg-red-100 text-red-800' : 'bg-emerald-50 text-emerald-800'}" aria-live="polite">
        {activeTabCount} of {maxActiveTabs} active
      </span>
    </div>

    {#if activeTabCount > maxActiveTabs}
      <p class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
        The app can show up to five tabs. Turn off at least {activeTabCount - maxActiveTabs} tab{activeTabCount - maxActiveTabs === 1 ? '' : 's'} before publishing.
      </p>
    {/if}
    {#if duplicateLabels}
      <p class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">Active app tabs must have unique names so families can distinguish each destination.</p>
    {/if}

    <div class="space-y-4">
      {#each tabsConfig as tab, index (tab.key)}
        <div class="crm-ui-studio-module-row">
          <div class="min-w-0 flex-1 pr-4">
            <h4 class="text-sm font-semibold text-gray-900">{permanentTabName(tab)}</h4>
            <input
              id={`studio-tab-name-${tab.key}`}
              type="text"
              bind:value={tab.label}
              aria-label={`Tab name for ${permanentTabName(tab)}`}
              maxlength="80"
              {disabled}
              class="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none"
            />
          </div>
          <button
            type="button"
            {disabled}
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {tab.enabled ? 'bg-[var(--crm-brand-control)]' : 'bg-gray-200'}"
            aria-label={`${tab.enabled ? 'Hide' : 'Show'} ${permanentTabName(tab)} tab`}
            aria-pressed={tab.enabled}
            on:click={() => toggleTab(index)}
          >
            <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {tab.enabled ? 'translate-x-5' : 'translate-x-0'}"></span>
          </button>
          <div class="ml-3 flex flex-col gap-1">
            <button type="button" aria-label={`Move ${permanentTabName(tab)} tab up`} disabled={disabled || index === 0} class="rounded border px-2 py-1 text-xs disabled:opacity-40" on:click={() => onMove(index, -1)}>↑</button>
            <button type="button" aria-label={`Move ${permanentTabName(tab)} tab down`} disabled={disabled || index === tabsConfig.length - 1} class="rounded border px-2 py-1 text-xs disabled:opacity-40" on:click={() => onMove(index, 1)}>↓</button>
          </div>
          {#if tab.enabled && activeContentCount(tab) > 0}
            <p class="mt-2 basis-full text-xs text-amber-800">Hiding this tab would remove access to {activeContentCount(tab)} active {permanentTabName(tab).toLowerCase()} record{activeContentCount(tab) === 1 ? '' : 's'} from family navigation; the content itself is retained.</p>
          {/if}
        </div>
      {/each}
      {#if tabsConfig.length === 0}
        <p class="text-sm text-gray-500">No app tabs are configured for this program.</p>
      {/if}
    </div>
  </div>
</div>
