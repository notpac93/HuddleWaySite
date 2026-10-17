<script lang="ts">
  import type { PortalIconName } from '../../lib/ui/portalIcons';
  import Icon from './ui/Icon.svelte';

  // Receive only destinations authorized by the existing admin entry point.
  // This component does not decide whether a user has completed onboarding.
  export let tabs: { name: string; label?: string; icon: PortalIconName }[] = [];
  export let activeTab = '';
  export let onNavigate: (name: string) => void;
  export let onMore: (trigger: HTMLButtonElement) => void;
  export let moreSelected = false;

  const primaryNames = ['Dashboard', 'Events', 'Messages', 'My App'];
  $: primaryTabs = primaryNames.flatMap((name) => tabs.filter((tab) => tab.name === name));
  $: moreActive = moreSelected || tabs.some((tab) => tab.name === activeTab) && !primaryNames.includes(activeTab);
</script>

<nav class="quick-access" aria-label="Admin quick access">
  {#each primaryTabs as tab (tab.name)}
    <button
      type="button"
      aria-current={activeTab === tab.name ? 'page' : undefined}
      on:click={() => onNavigate(tab.name)}
    >
      <Icon name={tab.icon} size={20} />
      <span>{tab.label || tab.name}</span>
    </button>
  {/each}
  <button
    type="button"
    class:more-active={moreActive}
    aria-label={moreSelected || !moreActive ? 'More' : `More, current section: ${activeTab}`}
    aria-current={moreActive ? 'page' : undefined}
    on:click={(event) => onMore(event.currentTarget)}
  >
    <Icon name="menu" size={20} />
    <span>More</span>
  </button>
</nav>

<style>
  .quick-access {
    display: flex;
    flex: none;
    gap: 2px;
    border-top: 1px solid #dce2eb;
    background: #fff;
    padding: 6px max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left));
  }
  button {
    position: relative;
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 56px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 0;
    border-radius: 10px;
    padding: 8px 2px;
    background: transparent;
    color: #44546a;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.25;
    cursor: pointer;
  }
  button[aria-current='page'], .more-active {
    background: #082b50;
    color: white;
  }
  button[aria-current='page']::before, .more-active::before {
    position: absolute;
    top: 3px;
    width: 18px;
    height: 3px;
    border-radius: 3px;
    background: #c6a95b;
    content: '';
  }
  button:focus-visible {
    outline: 2px solid #003366;
    outline-offset: 2px;
  }
</style>
