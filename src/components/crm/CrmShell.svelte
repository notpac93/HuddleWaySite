<script lang="ts">
  import type { Component } from 'svelte';
  import { startLiveRefresh } from '../../lib/crm/liveRefresh';
  import { pullToRefresh } from '../../lib/ui/pullToRefresh';
  import { programProfileStore, programTermsStore, programTabLabel, type ProgramProfile } from '../../lib/crm/programVocabulary';
  import { onDestroy, onMount, setContext, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { auth } from '../../lib/firebase';
  import { signOut } from 'firebase/auth';
  import { backendClient } from '../../lib/api/backendClient';
  import { publicEnvironment, resolveBackendUrl } from '../../lib/config/publicEnvironment';
  import {
    tenantIdStore,
    availableTenants,
    tenantNamesStore,
  } from '../../lib/authStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import {
    clearPortalDraft,
    portalDraftStore,
  } from '../../lib/ui/portalDraftGuard';
  import {
    buildCrmThemeTokens,
    serializeCrmThemeVariables,
  } from '../../lib/ui/crmTheme';
  import CrmBreadcrumbs from './CrmBreadcrumbs.svelte';
  import Icon from './ui/Icon.svelte';
  import AdminQuickAccess from './AdminQuickAccess.svelte';
  import { MY_APP_NAVIGATION, type MyAppNavigation } from '../../lib/crm/myAppNavigation';
  import AdminMoreScreen from './AdminMoreScreen.svelte';

  export let activeTab = 'Dashboard';
  export let tabs: any[] = [];
  export let activeTeam: any = null;
  export let onExitTeam = () => {};
  export let activeResultId: string | null = null;
  export let onSwitchTenant: (tenantId: string, preferredTab?: string) => void | Promise<void> = (tenantId) => {
    tenantIdStore.set(tenantId);
  };

  let showLogoutModal = false;
  let showOrgSwitcher = false;
  let showGlobalSearch = false;
  let showMobileMenu = false;
  let showMore = false;
  let showAdminTabs = false;
  setContext<MyAppNavigation>(MY_APP_NAVIGATION, { dismiss: () => showAdminTabs = false });
  $: immersiveApp = activeTab === 'My App' && !showMore;
  let mobileMenuOpener: HTMLButtonElement | null = null;
  let isMobileViewport = false;
  const quickAccessNames = new Set(['Dashboard', 'Events', 'Messages', 'My App']);
  $: moreTabs = tabs.filter((tab) => !quickAccessNames.has(tab.name));
  let mobileMenuTrigger: HTMLButtonElement | null = null;
  let globalSearchTrigger: HTMLButtonElement | null = null;
  let GlobalSearchComponent: Component<any> | null = null;
  let globalSearchLoadError = '';
  let logoutState: 'idle' | 'loading' | 'error' = 'idle';
  let logoutError = '';
  let pendingDraftAction: (() => void | Promise<void>) | null = null;
  let draftResolutionState: 'idle' | 'loading' | 'error' = 'idle';
  let draftResolutionError = '';

  const sidebarPreferenceKey = 'huddleway.crm.sidebar.expanded';
  let isSidebarExpanded = true;
  let pageHeading: HTMLHeadingElement | null = null;

  onMount(() => {
    isSidebarExpanded = window.localStorage.getItem(sidebarPreferenceKey) !== 'false';
    if (!window.matchMedia) return;
    const mobileViewport = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => {
      isMobileViewport = mobileViewport.matches;
      if (!isMobileViewport) { showMobileMenu = false; showMore = false; }
    };
    updateViewport();
    mobileViewport.addEventListener('change', updateViewport);
    return () => mobileViewport.removeEventListener('change', updateViewport);
  });

  function tabLabel(tab: any, terms = $programTermsStore) {
    return programTabLabel(tab?.name, String(tab?.label || tab?.name || 'Portal'), terms);
  }

  $: currentTabTitle = showMore ? 'More' : tabLabel(
    tabs.find((tab) => tab.name === activeTab) || { name: activeTab }, $programTermsStore,
  );

  function toggleSidebar() {
    isSidebarExpanded = !isSidebarExpanded;
    window.localStorage.setItem(sidebarPreferenceKey, String(isSidebarExpanded));
    if (!isSidebarExpanded) showOrgSwitcher = false;
  }

  async function handleLogout() {
    if (logoutState === 'loading') return;
    logoutState = 'loading';
    logoutError = '';
    try {
      if ($portalDraftStore) {
        await $portalDraftStore.onDiscard();
        clearPortalDraft($portalDraftStore.id);
      }
      await signOut(auth);
      showLogoutModal = false;
    } catch {
      console.error('Sign out failed.');
      logoutState = 'error';
      logoutError = 'Sign out could not be completed. Check your connection and try again.';
    }
  }

  async function performTenantSwitch(tenant: any) {
    const preferredTab = activeTab;
    showMore = false;
    showOrgSwitcher = false;
    showGlobalSearch = false;
    showMobileMenu = false;
    showLogoutModal = false;
    activeResultId = null;
    if (activeTeam) onExitTeam();
    activeTab = preferredTab;
    await onSwitchTenant(tenant, preferredTab);
  }

  function switchTenant(tenant: any) {
    runWithDraftGuard(() => performTenantSwitch(tenant));
  }

  let appName = 'HuddleWay';
  let logoUrl: string | null = null;
  const defaultLogoUrl = '/logo.webp';
  let resolvedLogoUrl = defaultLogoUrl;
  let brandingState: 'idle' | 'ready' | 'missing' | 'error' | 'permission' = 'idle';
  let brandingMessage = '';
  let unsubscribeTenant = () => {};
  let brandingGeneration = 0;
  let themeTokens = buildCrmThemeTokens(null);

  $: themeStyle = serializeCrmThemeVariables(themeTokens);

  onDestroy(() => {
    brandingGeneration += 1;
    unsubscribeTenant();
  });

  function resetBranding() {
    appName = 'HuddleWay';
    logoUrl = null;
    themeTokens = buildCrmThemeTokens(null);
  }

  function beginBrandingRequest() {
    brandingGeneration += 1;
    return brandingGeneration;
  }

  function isCurrentBrandingRequest(generation: number, tenantId: string) {
    return generation === brandingGeneration && get(tenantIdStore) === tenantId;
  }

  function resolveLogoUrl(value: any) {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (!candidate || candidate === 'null' || candidate === 'undefined') {
      return defaultLogoUrl;
    }

    // The mobile app stores its bundled HuddleWay logo as an asset path.
    // Browsers cannot load Flutter bundle paths, so use the equivalent CRM asset.
    if (candidate.startsWith('assets/images/branding/')) {
      return defaultLogoUrl;
    }

    return candidate;
  }

  function handleLogoError(event: Event) {
    const image = event.currentTarget;
    if (image && image.getAttribute('src') !== defaultLogoUrl) {
      image.src = defaultLogoUrl;
    }
  }

  $: resolvedLogoUrl = resolveLogoUrl(logoUrl);
  // API images require CORS mode under the backend resource policy.
  // Other hosted logos retain normal image loading without a CORS requirement.
  $: logoCrossOrigin = resolvedLogoUrl.startsWith(`${resolveBackendUrl(publicEnvironment)}/`) ? 'anonymous' : undefined;

  async function loadProgramProfile(tenantId: string, generation: number) {
    try {
      const result = await backendClient.request<{ programProfile: ProgramProfile }>('/admin/owner-onboarding/vocabulary', { query: { tenantId } });
      if (isCurrentBrandingRequest(generation, tenantId)) programProfileStore.set({ tenantId, profile: result.programProfile });
    } catch {
      // Older programs may not have a versioned onboarding profile.
      if (isCurrentBrandingRequest(generation, tenantId)) programProfileStore.set({ tenantId, profile: null });
    }
  }

  async function loadTenantBranding(tenantId: string | null) {
    const generation = beginBrandingRequest();
    resetBranding();
    programProfileStore.set({ tenantId: tenantId || '', profile: null });
    if (tenantId) void loadProgramProfile(tenantId, generation);
    brandingState = 'idle';
    brandingMessage = '';
    if (tenantId) {
      appName = get(tenantNamesStore)[tenantId] || 'HuddleWay';
      try {
        const snapshot = await backendClient.crmTenantBranding(tenantId);
        if (!isCurrentBrandingRequest(generation, tenantId)) return;
        if (snapshot.exists && snapshot.branding) {
          const data = snapshot.branding;
          appName = data.name || 'Organization name unavailable';
          logoUrl = data.logoUrl || null;
          themeTokens = buildCrmThemeTokens({
            primary: data.primaryColor,
            secondary: data.secondaryColor,
            tertiary: data.tertiaryColor,
          });
          brandingState = 'ready';
        } else {
          resetBranding();
          brandingState = 'missing';
          brandingMessage = 'No organization branding has been configured.';
        }
      } catch (error) {
        if (!isCurrentBrandingRequest(generation, tenantId)) return;
        console.error('Organization branding could not be loaded.');
        resetBranding();
        appName = get(tenantNamesStore)[tenantId] || 'HuddleWay';
        const status = Number((error as { status?: unknown })?.status || 0);
        brandingState = status === 401 || status === 403 ? 'permission' : 'error';
        brandingMessage = brandingState === 'permission'
          ? 'You do not have permission to load organization branding.'
          : 'Organization branding could not be loaded.';
      }
    }
  }

  // Subscribe imperatively so branding state changes cannot retrigger the
  // tenant lifecycle. Only an actual tenant-store emission starts a new
  // generation, which keeps current snapshot callbacks valid.
  unsubscribeTenant = tenantIdStore.subscribe((tenantId) => {
    void loadTenantBranding(tenantId);
  });

  function performActiveTabChange(tab: any) {
    activeResultId = null;
    activeTab = tab;
    showMore = false;
    showMobileMenu = false;
    void tick().then(() => pageHeading?.focus({ preventScroll: true }));
  }

  function setActiveTab(tab: any) {
    // A draft decision replaces the drawer, avoiding two simultaneous dialogs.
    if (showMobileMenu) closeMobileMenu();
    if (tab === activeTab) {
      showMore = false;
      showMobileMenu = false;
      void tick().then(() => pageHeading?.focus({ preventScroll: true }));
      return;
    }
    runWithDraftGuard(() => performActiveTabChange(tab));
  }

  function runWithDraftGuard(action: () => void | Promise<void>) {
    if (!$portalDraftStore) {
      void action();
      return;
    }
    pendingDraftAction = action;
    draftResolutionState = 'idle';
    draftResolutionError = '';
  }

  function stayWithDraft() {
    if (draftResolutionState === 'loading') return;
    pendingDraftAction = null;
    draftResolutionState = 'idle';
    draftResolutionError = '';
  }

  async function resolveDraft(retain: boolean) {
    const draft = $portalDraftStore;
    const action = pendingDraftAction;
    if (!draft || !action || draftResolutionState === 'loading') return;
    draftResolutionState = 'loading';
    draftResolutionError = '';
    try {
      if (retain && draft.onRetain) await draft.onRetain();
      else await draft.onDiscard();
      clearPortalDraft(draft.id);
      pendingDraftAction = null;
      draftResolutionState = 'idle';
      await action();
    } catch {
      draftResolutionState = 'error';
      draftResolutionError = retain
        ? 'The draft could not be saved in this browser.'
        : 'The draft could not be discarded safely.';
    }
  }

  function exitTeam() {
    runWithDraftGuard(onExitTeam);
  }

  function organizationName(tenantId: string, index: number) {
    return $tenantNamesStore[tenantId] || `Organization ${index + 1}`;
  }

  function openActiveTeamHome() {
    setActiveTab('Teams');
  }

  $: breadcrumbItems = activeTeam
    ? [
        { label: 'All teams', onSelect: exitTeam },
        {
          label: String(activeTeam.name || 'Team'),
          onSelect: activeTab === 'Teams' ? undefined : openActiveTeamHome,
          current: activeTab === 'Teams',
        },
        ...(activeTab === 'Teams'
          ? []
          : [{ label: currentTabTitle, current: true }]),
      ]
    : [{ label: currentTabTitle, current: true }];

  function handleSearchNavigate(event: CustomEvent<{ tab: string; id: string }>) {
    runWithDraftGuard(() => {
      showMore = false;
      activeResultId = event.detail.id;
      activeTab = event.detail.tab;
      showMobileMenu = false;
    });
  }

  async function openGlobalSearch() {
    // Programmatic clicks used by assistive technology do not always move
    // focus before the dialog mounts. Capture this as the return target.
    globalSearchTrigger?.focus();
    showGlobalSearch = true;
    globalSearchLoadError = '';
    if (GlobalSearchComponent) return;

    try {
      GlobalSearchComponent = (await import('./GlobalSearch.svelte')).default;
    } catch {
      console.error('Could not load global search.');
      showGlobalSearch = false;
      globalSearchLoadError =
        'Search could not be loaded. Check your connection and try again.';
    }
  }

  function handleGlobalShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      void openGlobalSearch();
    }
  }

  function closeLogoutModal() {
    if (logoutState === 'loading') return;
    showLogoutModal = false;
    logoutState = 'idle';
    logoutError = '';
  }

  function closeMobileMenu() {
    showMobileMenu = false;
    (mobileMenuOpener || mobileMenuTrigger)?.focus();
  }

  function openMobileMenu(trigger: HTMLButtonElement) {
    mobileMenuOpener = trigger;
    showMobileMenu = true;
  }

  function openMore() {
    if (showMore) return;
    runWithDraftGuard(() => {
      showMobileMenu = false;
      showMore = true;
      void tick().then(() => pageHeading?.focus({ preventScroll: true }));
    });
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!$portalDraftStore) return;
    event.preventDefault();
    event.returnValue = '';
  }

  onMount(startLiveRefresh);
</script>

<svelte:window on:keydown={handleGlobalShortcut} on:beforeunload={handleBeforeUnload} />

<div class="crm-ui-shell-root" class:immersive-app={immersiveApp} style={themeStyle} data-branding-state={brandingState}>
  {#if showMobileMenu}
    <div class="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        class="crm-ui-shell-mobile-overlay"
        aria-label="Close navigation menu"
        tabindex="-1"
        on:click={closeMobileMenu}
      ></button>
      <div
        class="crm-ui-shell-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        tabindex="-1"
        use:modalFocus={{ onEscape: closeMobileMenu, initialFocusSelector: '[data-mobile-close]' }}
      >
        <div class="crm-ui-shell-mobile-header">
          <img
            crossorigin={logoCrossOrigin} src={resolvedLogoUrl}
            width="32"
            height="32"
            decoding="async"
            on:error={handleLogoError}
            alt=""
            class="h-8 w-8 shrink-0 object-contain"
          />
          <h2 id="mobile-navigation-title" class="min-w-0 flex-1 truncate text-lg font-bold">{appName}</h2>
          <button
            type="button"
            class="crm-ui-shell-signout-icon"
            aria-label="Close navigation menu"
            data-mobile-close
            on:click={closeMobileMenu}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto p-3" aria-label="CRM sections">
          {#each tabs as tab}
            <button
              type="button"
              class="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm font-semibold {activeTab === tab.name ? 'crm-theme-sidebar-active' : 'crm-theme-sidebar-idle'}"
              aria-current={activeTab === tab.name ? 'page' : undefined}
              on:click={() => setActiveTab(tab.name)}
            >
              <Icon
                name={tab.icon}
                size={20}
                strokeWidth={1.5}
                className="mr-3 shrink-0 {activeTab === tab.name ? '' : 'crm-theme-sidebar-icon'}"
              />
              {tabLabel(tab, $programTermsStore)}
            </button>
          {/each}
        </nav>
        <div class="crm-theme-sidebar-divider-top space-y-2 p-4">
          {#if $availableTenants.length > 1}
            <p class="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--crm-on-sidebar-muted)]">Organization</p>
            {#each $availableTenants as tenant, index}
              <button
                type="button"
                class="w-full rounded-md px-2 py-2 text-left text-sm {$tenantIdStore === tenant ? 'crm-theme-sidebar-active' : 'crm-theme-sidebar-idle'}"
                aria-current={$tenantIdStore === tenant ? 'true' : undefined}
                on:click={() => { switchTenant(tenant); closeMobileMenu(); }}
              >
                {organizationName(tenant, index)}
              </button>
            {/each}
          {/if}
          <button
            type="button"
            class="crm-ui-shell-mobile-signout"
            on:click={() => { closeMobileMenu(); showLogoutModal = true; }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  {/if}

  <aside
    class="crm-theme-sidebar {isSidebarExpanded ? 'w-64' : 'w-20'} relative z-50 hidden shrink-0 flex-col overflow-visible shadow-lg transition-[width] duration-[var(--portal-motion-context)] ease-[var(--portal-ease-standard)] md:flex"
    data-sidebar-expanded={isSidebarExpanded}
  >
    <div class="crm-theme-sidebar-divider flex h-[73px] items-center {isSidebarExpanded ? 'gap-3 px-4' : 'justify-center px-3'}">
      <img
        crossorigin={logoCrossOrigin} src={resolvedLogoUrl}
        width="32"
        height="32"
        decoding="async"
        fetchpriority="high"
        on:error={handleLogoError}
        alt="{appName} logo"
        class="w-8 h-8 object-contain shrink-0"
      />
      {#if isSidebarExpanded}
        <span class="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{appName}</span>
      {/if}
      <button
        type="button"
        class="portal-motion-color absolute -right-3 top-[25px] flex h-6 w-6 items-center justify-center rounded-full border bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--crm-brand-focus)]"
        aria-label={isSidebarExpanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-pressed={isSidebarExpanded}
        title={isSidebarExpanded ? 'Collapse navigation' : 'Expand navigation'}
        on:click={toggleSidebar}
      >
        <Icon name={isSidebarExpanded ? 'chevronLeft' : 'chevronRight'} size={16} />
      </button>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
      {#each tabs as tab}
        <button
          type="button"
          class="portal-motion-color flex min-h-11 w-full items-center {isSidebarExpanded ? 'justify-start px-3.5' : 'justify-center px-0'} rounded-lg py-2.5 text-sm font-semibold {activeTab === tab.name ? 'crm-theme-sidebar-active shadow-md' : 'crm-theme-sidebar-idle'}"
          on:click={() => setActiveTab(tab.name)}
          title={!isSidebarExpanded ? tabLabel(tab, $programTermsStore) : ''}
          aria-current={activeTab === tab.name ? 'page' : undefined}
          aria-label={!isSidebarExpanded ? tabLabel(tab, $programTermsStore) : undefined}
        >
          <Icon
            name={tab.icon}
            size={20}
            strokeWidth={1.5}
            className="shrink-0 {activeTab === tab.name ? '' : 'crm-theme-sidebar-icon'} {isSidebarExpanded ? 'mr-3.5' : ''}"
          />
          {#if isSidebarExpanded}
            <span class="whitespace-nowrap font-medium">{tabLabel(tab, $programTermsStore)}</span>
          {/if}
        </button>
      {/each}
    </nav>

    <div class="crm-ui-shell-account">
      <div class="flex w-full items-center {isSidebarExpanded ? 'justify-between' : 'justify-center'}">
        <button
          type="button"
          class="flex min-h-11 items-center text-left {isSidebarExpanded ? 'mr-2 min-w-0 flex-1' : ''}"
          aria-label="Switch organization"
          aria-expanded={showOrgSwitcher}
          on:click={() => {
            isSidebarExpanded = true;
            window.localStorage.setItem(sidebarPreferenceKey, 'true');
            showOrgSwitcher = !showOrgSwitcher;
          }}
        >
          <span class="crm-ui-shell-avatar shrink-0">
            C
          </span>
          {#if isSidebarExpanded}
          <span class="ml-3 min-w-0 flex-1">
            <span class="text-sm font-medium flex items-center">
              <span class="truncate">{appName}</span>
              <Icon name="chevronDown" size={16} className="ml-1 shrink-0 text-[var(--crm-on-sidebar-muted)]" />
            </span>
            <span class="block text-xs text-[var(--crm-on-sidebar-muted)] truncate">Switch organization</span>
          </span>
          {/if}
        </button>
        <button
          type="button"
          class="crm-ui-shell-signout-icon shrink-0 {isSidebarExpanded ? 'block' : 'hidden'}"
          on:click={() => showLogoutModal = true}
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" size={20} />
        </button>
      </div>

      {#if showOrgSwitcher && $availableTenants.length > 0}
        <div class="crm-ui-shell-org-menu">
          {#each $availableTenants as tenant, index}
            <button
              type="button"
              class="w-full text-left px-4 py-2 text-sm {$tenantIdStore === tenant ? 'crm-theme-sidebar-active font-semibold' : 'crm-theme-sidebar-idle'} whitespace-nowrap"
              on:click={() => switchTenant(tenant)}
            >
              {organizationName(tenant, index)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </aside>

  <!-- Main content area -->
  <main class="crm-ui-shell-main" use:pullToRefresh={!immersiveApp && !showMore}>
    <!-- Top Bar -->
    <header class="crm-ui-shell-header" hidden={immersiveApp}>
      <button
        type="button"
        bind:this={mobileMenuTrigger}
        class="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={showMobileMenu}
        on:click={(event) => openMobileMenu(event.currentTarget)}
      >
        <Icon name="menu" size={20} />
      </button>
      {#if isMobileViewport}
        <div class="flex min-w-0 flex-1 items-center gap-2.5">
          <img crossorigin={logoCrossOrigin} src={resolvedLogoUrl} alt="Program logo" on:error={handleLogoError} class="h-9 w-9 shrink-0 rounded-xl object-contain" />
          <span class="truncate text-sm font-semibold text-gray-950">{appName}</span>
        </div>
      {:else}
        <CrmBreadcrumbs items={breadcrumbItems} />
      {/if}
      <div
        class="hidden min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 lg:flex"
        aria-label="Current portal scope"
      >
        <span class="font-medium text-gray-500">Scope</span>
        <span class="max-w-40 truncate font-semibold text-gray-900">{appName}</span>
        {#if activeTeam}
          <span aria-hidden="true">/</span>
          <span class="max-w-40 truncate font-semibold text-[var(--crm-brand-link)]">{activeTeam.name || 'Team'}</span>
          <button
            type="button"
            class="portal-motion-color rounded px-1.5 py-1 font-semibold text-[var(--crm-brand-link)] hover:bg-[var(--crm-brand-surface)]"
            on:click={exitTeam}
          >All teams</button>
        {/if}
      </div>
      <div class="max-w-lg md:flex-1 md:px-4 lg:px-8">
        <div class="relative group">
          <div class="crm-ui-shell-search-icon hidden md:block">
            <Icon name="search" size={16} className="crm-theme-search-icon" />
          </div>
          <button
            type="button"
            bind:this={globalSearchTrigger}
            class={isMobileViewport ? 'grid h-11 w-11 place-items-center rounded-full text-gray-700 hover:bg-gray-100' : 'crm-ui-shell-search'}
            aria-describedby={globalSearchLoadError ? 'global-search-error' : undefined}
            aria-label="Search across HuddleWay (Cmd+K)"
            on:click={openGlobalSearch}
          >
            {#if isMobileViewport}<Icon name="search" size={20} />{:else}<span>Search across HuddleWay (Cmd+K)</span>{/if}
          </button>
          {#if globalSearchLoadError}
            <p id="global-search-error" class="sr-only" role="alert">
              {globalSearchLoadError}
            </p>
          {/if}
        </div>
      </div>
      <div class="flex space-x-3"></div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col">
      <h1 class="sr-only" tabindex="-1" bind:this={pageHeading}>{currentTabTitle}</h1>
      {#if brandingState === 'error' || brandingState === 'permission'}
        <p class="crm-ui-shell-brand-error" role="alert">{brandingMessage}</p>
      {:else if brandingState === 'missing'}
        <p class="sr-only" role="status">{brandingMessage}</p>
      {/if}
      {#if showMore}
        <AdminMoreScreen
          tabs={moreTabs.map((tab) => ({ ...tab, label: tabLabel(tab, $programTermsStore) }))}
          programs={$availableTenants.map((id, index) => ({ id, name: organizationName(id, index) }))}
          currentProgram={$tenantIdStore || ''}
          onNavigate={setActiveTab}
          onSwitchProgram={switchTenant}
          onSignOut={() => showLogoutModal = true}
        />
      {/if}
      <div hidden={showMore} style:display={showMore ? 'none' : 'flex'} class="min-h-0 flex-1 flex-col">
        {#if isMobileViewport && !quickAccessNames.has(activeTab)}
          <div class="px-4 pt-3"><button type="button" class="min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--crm-brand-link)]" on:click={openMore}>← More</button></div>
        {/if}
        <slot />
      </div>
    </div>
  </main>

  {#if immersiveApp}
    <button type="button" class="app-admin-toggle" aria-controls="app-admin-navigation" aria-expanded={showAdminTabs} on:click={() => showAdminTabs = !showAdminTabs}>
      <Icon name="menu" size={18} />{showAdminTabs ? 'Hide tabs' : 'Admin tabs'}
    </button>
  {/if}
  {#if isMobileViewport || immersiveApp}
    <div id="app-admin-navigation" class:app-navigation-overlay={immersiveApp} class:app-navigation-hidden={immersiveApp && !showAdminTabs} inert={immersiveApp && !showAdminTabs} aria-hidden={immersiveApp && !showAdminTabs ? 'true' : undefined}>
    <AdminQuickAccess
      tabs={tabs.map(tab => ({ ...tab, label: tabLabel(tab, $programTermsStore) }))}
      activeTab={showMore ? '' : activeTab}
      onNavigate={setActiveTab}
      onMore={openMore}
      moreSelected={showMore}
    />
    </div>
  {/if}

  <!-- Logout Confirmation Modal -->
  {#if showLogoutModal}
    <div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="crm-ui-modal-shell">

        <!-- Background overlay -->
        <button type="button" class="crm-ui-backdrop" aria-label="Cancel sign out" tabindex="-1" on:click={closeLogoutModal}></button>

        <!-- Center modal trick -->
        <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

        <div class="crm-ui-shell-logout-panel" tabindex="-1" use:modalFocus={{ onEscape: closeLogoutModal }}>
          <div class="crm-ui-modal-body">
            <div class="sm:flex sm:items-start">
              <div class="crm-ui-shell-logout-icon">
                <Icon name="logout" size={24} className="text-red-600" />
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 class="crm-ui-modal-title" id="modal-title">
                  Sign Out
                </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500">
                    Are you sure you want to sign out? You will need to log back in to manage your organization.
                  </p>
                  {#if $portalDraftStore}
                    <p class="mt-2 text-sm font-medium text-amber-800">Signing out will discard {$portalDraftStore.title.toLowerCase()}.</p>
                  {/if}
                </div>
              </div>
            </div>
          </div>
          <div class="crm-ui-shell-logout-actions">
            <button type="button" disabled={logoutState === 'loading'} class="crm-ui-shell-logout-primary" on:click={handleLogout}>
              {logoutState === 'loading' ? 'Signing out…' : 'Sign out'}
            </button>
            <button type="button" disabled={logoutState === 'loading'} class="crm-ui-shell-logout-secondary" on:click={closeLogoutModal}>
              Cancel
            </button>
          </div>
          {#if logoutError}
            <p class="bg-red-50 px-6 pb-4 text-sm text-red-800" role="alert">{logoutError}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if pendingDraftAction && $portalDraftStore}
    <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="draft-navigation-title">
      <div class="crm-ui-modal-shell">
      <button type="button" class="crm-ui-backdrop" aria-label="Stay on this page" tabindex="-1" disabled={draftResolutionState === 'loading'} on:click={stayWithDraft}></button>
      <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
      <div class="crm-ui-shell-logout-panel draft-navigation-panel" tabindex="-1" use:modalFocus={{ onEscape: stayWithDraft }}>
        <div class="p-6">
          <h2 id="draft-navigation-title" class="text-lg font-semibold text-gray-950">{$portalDraftStore.title}</h2>
          <p class="mt-2 text-sm leading-5 text-gray-600">{$portalDraftStore.message}</p>
          {#if draftResolutionError}<p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{draftResolutionError}</p>{/if}
        </div>
        <div class="draft-navigation-actions">
          <button type="button" class="crm-ui-button-secondary" disabled={draftResolutionState === 'loading'} on:click={stayWithDraft}>Keep editing</button>
          {#if $portalDraftStore.onRetain}
            <button type="button" class="crm-ui-button-primary" disabled={draftResolutionState === 'loading'} on:click={() => resolveDraft(true)}>
              {draftResolutionState === 'loading' ? 'Saving…' : $portalDraftStore.retainLabel || 'Save draft & leave'}
            </button>
          {:else}
            <button type="button" class="crm-ui-button-danger-outline" disabled={draftResolutionState === 'loading'} on:click={() => resolveDraft(false)}>Discard & leave</button>
          {/if}
        </div>
      </div>
      </div>
    </div>
  {/if}

  {#if showGlobalSearch && GlobalSearchComponent}
    <svelte:component
      this={GlobalSearchComponent}
      bind:isOpen={showGlobalSearch}
      on:navigate={handleSearchNavigate}
    />
  {:else if showGlobalSearch}
    <div class="crm-ui-shell-search-loading" role="status">
      <div class="crm-ui-shell-search-loading-card">
        Loading search…
      </div>
    </div>
  {/if}
</div>

<style>
  :global(.crm-pull-indicator) { position: absolute; top: 4.5rem; left: 50%; transform: translateX(-50%); z-index: 40; border-radius: 999px; padding: .6rem 1rem; background: var(--crm-brand-control); color: var(--crm-on-primary); box-shadow: 0 3px 12px #0002; font-size: .875rem; pointer-events: none; }

  .draft-navigation-panel { width: 100%; max-width: 420px; border-radius: 20px; }
  .draft-navigation-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; padding: 0 24px 24px; }
  .immersive-app { position: relative; height: 100dvh; }
  .immersive-app :global(.crm-theme-sidebar), .immersive-app .crm-ui-shell-header { display: none; }
  .immersive-app .crm-ui-shell-main { min-height: 0; overflow: hidden; z-index: auto; }
  .app-admin-toggle { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, calc((100% - 480px) / 2 + 12px)); z-index: 36; display: flex; align-items: center; gap: 6px; min-height: 44px; border: 1px solid #dce2eb; border-radius: 14px; background: white; padding: 8px 12px; color: #183049; font-size: 12px; font-weight: 600; box-shadow: 0 3px 14px #0001; }
  .app-navigation-overlay { position: absolute; bottom: 0; left: 50%; width: min(100%, 480px); z-index: 36; min-height: 84px; padding-top: 8px; background: white; transform: translate(-50%, 0); transition: transform 380ms cubic-bezier(.22,1,.36,1), visibility 0s; box-shadow: 0 -2px 10px #0001; }
  .app-navigation-hidden { transform: translate(-50%, 110%); visibility: hidden; pointer-events: none; transition: transform 380ms cubic-bezier(.22,1,.36,1), visibility 0s 380ms; }
  @media (prefers-reduced-motion: reduce) { .app-navigation-overlay { transition: none; } }

  @media (max-width: 767px) {
    .crm-ui-shell-root {
      height: 100dvh;
      flex-direction: column;
    }
    .crm-ui-shell-main {
      min-height: 0;
      min-width: 0;
    }
  }
</style>
