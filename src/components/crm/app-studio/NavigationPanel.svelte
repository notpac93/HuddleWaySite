<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { backendClient } from '../../../lib/api/backendClient';
  import { eventsStore, teamsStore } from '../../../lib/services/DataStore';
  import type { NavigationTabDraft } from './appConfigurationDraft';
  import { isRetiredNavigationTab } from '../../../lib/ui/appConfigurationReview';
  import { maxActiveTabs, optionalNavigationTabs, permanentTabName } from './appConfigurationDraft';

  export let tenantId: string;
  export let tabsConfig: NavigationTabDraft[] = [];
  export let disabled = false;
  export let duplicateLabels = false;

  const supportedRoutes = new Set(['/', '/teams', '/scores', '/schedule', '/resources', '/staff', '/messaging', '/my-events', '/account', '/contact']);
  let pages: NavigationTabDraft[] = [];
  let pageState: 'loading' | 'ready' | 'error' = 'loading';
  let alive = false;
  let menu = '';
  let editKey = '';
  let editMode: 'position' | 'name' = 'position';
  let position = 0;
  let label = '';
  let replacement: NavigationTabDraft | null = null;
  let replacementKey = '';
  let dragKey = '';
  let dropTarget = '';
  let announcement = '';
  let editField: HTMLInputElement | HTMLSelectElement;

  $: current = tabsConfig.filter((tab) => !isRetiredNavigationTab(tab) && tab.enabled);
  $: configured = tabsConfig.filter((tab) => !isRetiredNavigationTab(tab) && !tab.enabled);
  $: available = [...configured, ...pageChoices(tabsConfig, pages)];
  $: retired = tabsConfig.filter(isRetiredNavigationTab);
  $: storedEnabledCount = tabsConfig.filter((tab) => tab.enabled).length;
  $: blockedByHistory = storedEnabledCount > maxActiveTabs && current.length <= maxActiveTabs;
  $: draggedTab = [...current, ...available].find((tab) => tab.key === dragKey);

  function pageChoices(saved: NavigationTabDraft[], published: NavigationTabDraft[]) {
    const byRoute = new Map(optionalNavigationTabs.map((tab) => [tab.route, tab]));
    for (const page of published) {
      if (page.route !== '/teams') byRoute.set(page.route, page);
    }
    return [...byRoute.values()].filter((page) =>
      !saved.some((tab) => tab.route === page.route || tab.key === page.key));
  }

  onMount(() => {
    alive = true;
    void loadPages();
    return () => { alive = false; };
  });

  async function loadPages() {
    const requestedTenant = tenantId;
    pageState = 'loading';
    try {
      const snapshot = await backendClient.componentStudio(requestedTenant);
      if (!alive || requestedTenant !== tenantId) return;
      if (snapshot.tenantId !== tenantId) throw new Error('Unexpected program');
      pages = snapshot.pages
        .filter((page) => page.isVisible && page.status === 'published'
          && supportedRoutes.has(page.route))
        .map((page) => ({
          key: page.route.slice(1) || 'home',
          pageId: page.id,
          route: page.route,
          label: page.title.trim().slice(0, 80) || page.route,
          enabled: false,
        }));
      pageState = 'ready';
    } catch {
      if (alive && requestedTenant === tenantId) pageState = 'error';
    }
  }

  function contentCount(tab: NavigationTabDraft) {
    if (tab.route === '/schedule') return $eventsStore.filter((event) =>
      !['cancelled', 'archived'].includes(String(event.status || event.lifecycleStatus || '').toLowerCase())).length;
    return permanentTabName(tab) === 'Teams' ? $teamsStore.length : 0;
  }

  function pageHint(tab: NavigationTabDraft, count: number) {
    if (tab.route === '/account' || tab.route === '/my-events') return 'Sign-in required';
    if (tab.route === '/resources' && count >= maxActiveTabs && tab.label.trim().length > 8) return 'Shows as Files in the tab bar';
    return '';
  }

  function canChoose(tab: NavigationTabDraft) {
    return !disabled && (tabsConfig.length < 12 || tabsConfig.some((saved) => saved.key === tab.key));
  }

  function placeTab(tab: NavigationTabDraft, position: number, replaced?: NavigationTabDraft) {
    const order = current.filter((entry) => entry.key !== tab.key && entry.key !== replaced?.key);
    order.splice(position, 0, { ...tab, enabled: true });
    let index = 0;
    const marked = tabsConfig.some((saved) => saved.key === tab.key)
      ? tabsConfig.map((saved) => saved.key === tab.key ? { ...saved, enabled: true } : saved)
      : [...tabsConfig, { ...tab, enabled: true }];
    // A retired Events entry can remain in history without taking a visible slot.
    const retireLegacySlot = !tab.enabled && storedEnabledCount >= maxActiveTabs;
    tabsConfig = marked.map((entry) => {
      if (entry.key === replaced?.key) return { ...entry, enabled: false };
      if (!isRetiredNavigationTab(entry) && entry.enabled) return order[index++];
      return retireLegacySlot && isRetiredNavigationTab(entry) ? { ...entry, enabled: false } : entry;
    });
    announcement = replaced ? `${tab.label} replaced ${replaced.label} in the draft.`
      : tab.label + (tab.enabled ? ' moved in the draft.' : ' added to the draft.');
  }

  function hideTab(tab: NavigationTabDraft) {
    if (disabled || tab.route === '/') return;
    tabsConfig = tabsConfig.map((entry) => entry.key === tab.key ? { ...entry, enabled: false } : entry);
    menu = '';
    announcement = tab.label + ' hidden from the draft. Its page is kept.';
  }

  function addTab(tab: NavigationTabDraft) {
    if (!canChoose(tab)) return;
    if (current.length < maxActiveTabs) placeTab(tab, current.length);
    else {
      replacement = tab;
      replacementKey = '';
      menu = editKey = '';
    }
  }

  function replaceTab() {
    const index = current.findIndex((tab) => tab.key === replacementKey && tab.route !== '/');
    if (!replacement || !canChoose(replacement) || index < 0) return;
    placeTab(replacement, index, current[index]);
    replacement = null;
  }

  async function openEdit(tab: NavigationTabDraft, mode: 'position' | 'name') {
    editKey = tab.key;
    editMode = mode;
    label = tab.label;
    position = current.findIndex((entry) => entry.key === tab.key);
    menu = '';
    await tick();
    editField?.focus();
  }

  function applyEdit(tab: NavigationTabDraft) {
    if (disabled) return;
    if (editMode === 'position') {
      if (position !== current.findIndex((entry) => entry.key === tab.key)) placeTab(tab, position);
    } else if (label.trim() && label.trim() !== tab.label) {
      tabsConfig = tabsConfig.map((entry) => entry.key === tab.key ? { ...entry, label: label.trim() } : entry);
      announcement = 'Tab renamed in the draft.';
    }
    editKey = '';
  }

  function allowDrop(event: DragEvent, target: string) {
    if (!dragKey || disabled) return;
    if (target === 'available' && (!draggedTab?.enabled || draggedTab.route === '/')) return;
    event.preventDefault();
    event.stopPropagation();
    dropTarget = target;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function clearDrag() {
    dragKey = '';
    dropTarget = '';
  }

  function startDrag(event: DragEvent, tab: NavigationTabDraft) {
    if (disabled || (!tab.enabled && !canChoose(tab)) || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    menu = '';
    dragKey = tab.key;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tab.key);
  }

  function dropTab(event: DragEvent, zone: 'current' | 'available', beforeKey?: string) {
    if (!dragKey || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const tab = [...current, ...available].find((entry) => entry.key === dragKey);
    clearDrag();
    if (!tab) return;
    if (zone === 'available') {
      if (tab.enabled) hideTab(tab);
    } else if (!tab.enabled && current.length >= maxActiveTabs) {
      addTab(tab);
    } else if (tab.key !== beforeKey && (tab.enabled || canChoose(tab))) {
      const others = current.filter((entry) => entry.key !== tab.key);
      const index = others.findIndex((entry) => entry.key === beforeKey);
      placeTab(tab, index < 0 ? others.length : index);
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      replacement = null;
      menu = '';
      editKey = '';
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

<div class="navigation-editor">
  <header class="navigation-heading">
    <div>
      <h3>App tabs</h3>
      <p>Drag to reorder. Drop a tab in Available pages to hide it from the draft.</p>
    </div>
    <span class="navigation-count" aria-live="polite">{current.length} of {maxActiveTabs} active</span>
  </header>
  {#if current.length > maxActiveTabs}
    <p class="navigation-alert" role="alert">The app can show up to five tabs. Hide another tab before publishing.</p>
  {:else if blockedByHistory}
    <p class="navigation-alert" role="alert">The preserved retired Events setting still uses {storedEnabledCount - current.length} stored configuration slot{storedEnabledCount - current.length === 1 ? '' : 's'}. Hide another tab before publishing.</p>
  {/if}
  {#if duplicateLabels}
    <p class="navigation-alert" role="alert">Active tabs must have unique names.</p>
  {/if}

  <section class="navigation-list" aria-label="Draft tabs" class:drop-zone={dropTarget === 'current'}
    on:dragover={(event) => allowDrop(event, 'current')} on:drop={(event) => dropTab(event, 'current')}>
    <h4>Draft tabs</h4>
    {#each current as tab (tab.key)}
      <div class="navigation-row" role="group" aria-label={tab.label + ' tab'} class:drop-before={dropTarget === tab.key}
        draggable={!disabled && editKey !== tab.key} on:dragstart={(event) => startDrag(event, tab)} on:dragend={clearDrag}
        on:dragover={(event) => allowDrop(event, tab.key)} on:drop={(event) => dropTab(event, 'current', tab.key)}>
        <div class="navigation-name"><span class="navigation-grip" aria-hidden="true">⠿</span><span><strong>{tab.label}</strong>{#if pageHint(tab, current.length)}<small>{pageHint(tab, current.length)}</small>{:else if permanentTabName(tab) !== tab.label}<small>{permanentTabName(tab)}</small>{/if}</span></div>
        <button class="navigation-more" type="button" aria-label={'Options for ' + tab.label} aria-expanded={menu === tab.key} {disabled}
          on:click={() => { menu = menu === tab.key ? '' : tab.key; editKey = ''; }}>⋯</button>
        {#if menu === tab.key}
          <div class="navigation-menu" role="group" aria-label={tab.label + ' options'}>
            <button type="button" on:click={() => openEdit(tab, 'position')} disabled={disabled || current.length < 2}>Change position</button>
            <button type="button" on:click={() => openEdit(tab, 'name')} {disabled}>Rename</button>
            {#if tab.route !== '/'}
              <button type="button" aria-label={'Hide ' + tab.label + ' tab'} on:click={() => hideTab(tab)} {disabled}>Hide from app</button>
              {#if contentCount(tab) > 0}<small>{contentCount(tab)} active records stay in this program.</small>{/if}
            {/if}
          </div>
        {/if}
        {#if editKey === tab.key}
          <form class="navigation-edit" on:submit|preventDefault={() => applyEdit(tab)}>
            {#if editMode === 'position'}
              <label>Position <select bind:value={position} bind:this={editField} {disabled}>
                {#each current as entry, index (entry.key)}<option value={index}>{index + 1}</option>{/each}
              </select></label>
            {:else}
              <label>Tab name <input bind:value={label} bind:this={editField} maxlength="80" required {disabled} /></label>
            {/if}
            <button class="navigation-link" type="submit" disabled={disabled || (editMode === 'name' && !label.trim())}>Done</button>
            <button class="navigation-link" type="button" on:click={() => { editKey = ''; }}>Cancel</button>
          </form>
        {/if}
      </div>
    {:else}
      <p>Drag a page here or choose Add below.</p>
    {/each}
  </section>

  <section class="navigation-list" aria-label="Available pages" class:drop-zone={dropTarget === 'available'}
    on:dragover={(event) => allowDrop(event, 'available')} on:drop={(event) => dropTab(event, 'available')}>
    <h4>Available pages</h4>
    {#if draggedTab?.enabled && draggedTab.route !== '/'}<p class="navigation-drop-hint">Drop {draggedTab.label} here to hide it from the draft.</p>{/if}
    {#each available as tab (tab.key)}
      <div class="navigation-row" role="group" aria-label={tab.label + ' page'} draggable={canChoose(tab)}
        on:dragstart={(event) => startDrag(event, tab)} on:dragend={clearDrag}>
        <div class="navigation-name"><span class="navigation-grip" aria-hidden="true">⠿</span><span><strong>{tab.label}</strong>{#if pageHint(tab, Math.min(current.length + 1, maxActiveTabs))}<small>{pageHint(tab, Math.min(current.length + 1, maxActiveTabs))}</small>{/if}</span></div>
        <button class="navigation-link" type="button" aria-label={current.length >= maxActiveTabs ? 'Replace a tab with ' + tab.label : 'Add ' + tab.label + ' tab'} disabled={!canChoose(tab)} on:click={() => addTab(tab)}>{current.length >= maxActiveTabs ? 'Replace…' : 'Add'}</button>
        {#if replacement?.key === tab.key}
          <form class="navigation-edit" on:submit|preventDefault={replaceTab}>
            <label>Tab to replace <select bind:value={replacementKey} required {disabled}>
              <option value="" disabled>Choose a tab</option>
              {#each current.filter((entry) => entry.route !== '/') as entry (entry.key)}<option value={entry.key}>{entry.label}</option>{/each}
            </select></label>
            <button class="navigation-link" type="submit" disabled={disabled || !replacementKey}>Replace tab</button>
            <button class="navigation-link" type="button" on:click={() => replacement = null}>Cancel</button>
          </form>
        {/if}
      </div>
    {/each}
    {#if pageState === 'loading'}<p role="status">Loading published pages…</p>
    {:else if pageState === 'error'}<p>Could not load additional pages. <button class="navigation-link" type="button" on:click={loadPages}>Try again</button></p>
    {:else if !available.length}<p>No other pages are available.</p>{/if}
  </section>
  {#if retired.length}<p role="note" aria-label="Retired Events tab">Events (retired) is kept for historical settings. Families use Schedule.</p>{/if}
  <p class="sr-only" role="status">{announcement}</p>
</div>

<style>
  .navigation-editor { display: grid; gap: 12px; max-width: 54rem; color: var(--crm-brand-ink, #172638); }
  .navigation-heading, .navigation-row, .navigation-name, .navigation-edit { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .navigation-heading, .navigation-row { justify-content: space-between; }
  h3 { font-size: 1rem; font-weight: 650; }
  h4, strong { font-size: .875rem; font-weight: 600; }
  h4 { margin-bottom: 5px; }
  p, small { color: #526174; font-size: .8125rem; }
  .navigation-drop-hint { padding: 6px 0; color: var(--crm-brand-link, #226953); }
  .navigation-name small { display: block; }
  .navigation-count { background: var(--crm-brand-surface, #edf5f1); color: var(--crm-brand-link, #226953); border-radius: 8px; padding: 4px 8px; font-size: .75rem; }
  .navigation-list { border: 1px solid #dae1e7; border-radius: 10px; padding: 11px 12px; background: white; }
  .navigation-row { position: relative; border-top: 1px solid #edf0f2; min-height: 42px; padding: 3px 0; }
  .navigation-row[draggable="true"] { cursor: grab; }
  .navigation-grip { color: #637486; font-size: 1.15rem; padding: 0 3px; }
  .navigation-more, .navigation-link, .navigation-menu button { border-radius: 6px; background: transparent; font-size: .8125rem; padding: 6px 8px; }
  .navigation-more { color: #445467; font-size: 1.2rem; width: 36px; min-height: 34px; line-height: 1; }
  .navigation-link, .navigation-menu button { color: var(--crm-brand-link, #226953); }
  button:not(:disabled):hover, .drop-zone { background: var(--crm-brand-surface, #edf5f1); }
  button:disabled { opacity: .45; }
  .drop-before { box-shadow: inset 0 2px var(--crm-brand-control, #226953); }
  .navigation-menu { position: absolute; z-index: 3; right: 0; top: calc(100% - 3px); min-width: 145px; max-width: 220px; background: white; border: 1px solid #dae1e7; border-radius: 8px; padding: 4px; display: grid; box-shadow: 0 8px 20px #19283a21; }
  .navigation-menu button { text-align: left; }
  .navigation-menu small { padding: 4px 8px; }
  .navigation-edit { width: 100%; padding: 3px 0; }
  .navigation-edit input, .navigation-edit select { border: 1px solid #bac5d0; border-radius: 6px; font-size: .875rem; padding: 3px 6px; max-width: 100%; }
  .navigation-alert { background: #fef2f2; color: #991b1b; border-radius: 6px; padding: 8px; }
  @media (pointer: coarse) { .navigation-more, .navigation-link, .navigation-menu button { min-width: 44px; min-height: 44px; } }
</style>
