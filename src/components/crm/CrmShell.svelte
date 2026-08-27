<script lang="ts">
  import type { Component } from 'svelte';
  import { onDestroy } from 'svelte';
  import { auth, db } from '../../lib/firebase';
  import { signOut } from 'firebase/auth';
  import { doc, onSnapshot } from 'firebase/firestore';
  import {
    tenantIdStore,
    availableTenants,
    tenantNamesStore,
  } from '../../lib/authStore';
  import { modalFocus } from '../../lib/ui/modalFocus';
  import CrmBreadcrumbs from './CrmBreadcrumbs.svelte';

  export let activeTab = 'Dashboard';
  export let tabs: any[] = [];
  export let activeTeam: any = null;
  export let onExitTeam = () => {};
  export let activeResultId: string | null = null;
  export let onSwitchTenant: (tenantId: string) => void | Promise<void> = (tenantId) => {
    tenantIdStore.set(tenantId);
  };

  let showLogoutModal = false;
  let showOrgSwitcher = false;
  let showGlobalSearch = false;
  let showMobileMenu = false;
  let mobileMenuTrigger: HTMLButtonElement | null = null;
  let globalSearchTrigger: HTMLButtonElement | null = null;
  let GlobalSearchComponent: Component<any> | null = null;
  let globalSearchLoadError = '';
  let logoutState: 'idle' | 'loading' | 'error' = 'idle';
  let logoutError = '';

  let isSidebarHovered = false;
  let hoverTimeout: any;

  function handleSidebarMouseEnter() {
    clearTimeout(hoverTimeout);
    isSidebarHovered = true;
  }

  function handleSidebarMouseLeave() {
    hoverTimeout = setTimeout(() => {
      isSidebarHovered = false;
      showOrgSwitcher = false;
    }, 150);
  }

  async function handleLogout() {
    if (logoutState === 'loading') return;
    logoutState = 'loading';
    logoutError = '';
    try {
      await signOut(auth);
      showLogoutModal = false;
    } catch {
      console.error('Sign out failed.');
      logoutState = 'error';
      logoutError = 'Sign out could not be completed. Check your connection and try again.';
    }
  }

  async function switchTenant(tenant: any) {
    showOrgSwitcher = false;
    showGlobalSearch = false;
    showMobileMenu = false;
    showLogoutModal = false;
    activeResultId = null;
    if (activeTeam) onExitTeam();
    activeTab = String(tabs[0]?.name || 'Dashboard');
    await onSwitchTenant(tenant);
  }

  let appName = 'HuddleWay';
  let logoUrl: string | null = null;
  const defaultLogoUrl = '/logo.webp';
  let resolvedLogoUrl = defaultLogoUrl;
  let brandingState: 'idle' | 'ready' | 'missing' | 'error' | 'permission' = 'idle';
  let brandingMessage = '';
  let unsubscribeBranding = () => {};

  onDestroy(() => {
    unsubscribeBranding();
    clearTimeout(hoverTimeout);
  });

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

  $: {
    if ($tenantIdStore) {
      unsubscribeBranding();
      brandingState = 'idle';
      brandingMessage = '';
      unsubscribeBranding = onSnapshot(
        doc(db, 'tenant_branding', $tenantIdStore),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            appName = data.name || 'Organization name unavailable';
            logoUrl = data.logoUrl || null;
            brandingState = 'ready';
          } else {
            appName = 'HuddleWay';
            logoUrl = null;
            brandingState = 'missing';
            brandingMessage = 'No organization branding has been configured.';
          }
        },
        (error) => {
          console.error('Organization branding could not be loaded.');
          appName = 'Organization name unavailable';
          logoUrl = null;
          const code = String((error as { code?: unknown })?.code || '');
          brandingState = code.includes('permission-denied') ? 'permission' : 'error';
          brandingMessage = brandingState === 'permission'
            ? 'You do not have permission to load organization branding.'
            : 'Organization branding could not be loaded.';
        },
      );
    } else {
      unsubscribeBranding();
      appName = 'HuddleWay';
      logoUrl = null;
      brandingState = 'idle';
      brandingMessage = '';
    }
  }

  function setActiveTab(tab: any) {
    activeResultId = null;
    activeTab = tab;
    showMobileMenu = false;
  }

  function organizationName(tenantId: string, index: number) {
    return $tenantNamesStore[tenantId] || `Organization ${index + 1}`;
  }

  function openActiveTeamHome() {
    setActiveTab('Rostering');
  }

  $: breadcrumbItems = activeTeam
    ? [
        { label: 'Organization', onSelect: onExitTeam },
        {
          label: String(activeTeam.name || 'Team'),
          onSelect: activeTab === 'Rostering' ? undefined : openActiveTeamHome,
          current: activeTab === 'Rostering',
        },
        ...(activeTab === 'Rostering'
          ? []
          : [{ label: activeTab, current: true }]),
      ]
    : [{ label: activeTab, current: true }];

  function handleSearchNavigate(event: CustomEvent<{ tab: string; id: string }>) {
    activeResultId = event.detail.id;
    activeTab = event.detail.tab;
    showMobileMenu = false;
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
    mobileMenuTrigger?.focus();
  }
</script>

<svelte:window on:keydown={handleGlobalShortcut} />

<div class="crm-ui-shell-root">
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
            src={resolvedLogoUrl}
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
            class="rounded-md p-2 text-gray-300 hover:bg-white/10 hover:text-white"
            aria-label="Close navigation menu"
            data-mobile-close
            on:click={closeMobileMenu}
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto p-3" aria-label="CRM sections">
          {#each tabs as tab}
            <button
              type="button"
              class="flex w-full items-center rounded-lg px-3 py-3 text-left text-sm font-semibold {activeTab === tab.name ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-white/10'}"
              aria-current={activeTab === tab.name ? 'page' : undefined}
              on:click={() => setActiveTab(tab.name)}
            >
              <svg class="mr-3 h-5 w-5 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
              </svg>
              {tab.name}
            </button>
          {/each}
        </nav>
        <div class="space-y-2 border-t border-slate-700 p-4">
          {#if $availableTenants.length > 1}
            <p class="px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Organization</p>
            {#each $availableTenants as tenant, index}
              <button
                type="button"
                class="w-full rounded-md px-2 py-2 text-left text-sm {$tenantIdStore === tenant ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}"
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
    class="{isSidebarHovered ? 'w-64' : 'w-20'} border-r border-[#15202f] flex-col hidden md:flex text-gray-200 transition-[width] duration-300 ease-in-out relative z-50 overflow-visible shrink-0 shadow-lg"
    style="background-color: #0f172a;"
    on:mouseenter={handleSidebarMouseEnter}
    on:mouseleave={handleSidebarMouseLeave}
  >
    <div class="p-5 flex items-center {isSidebarHovered ? 'space-x-3' : 'justify-center'} text-white border-b border-[#1e293b] h-[73px]">
      <img
        src={resolvedLogoUrl}
        width="32"
        height="32"
        decoding="async"
        fetchpriority="high"
        on:error={handleLogoError}
        alt="{appName} logo"
        class="w-8 h-8 object-contain shrink-0"
      />
      <span class="text-xl font-bold tracking-tight truncate flex-1 min-w-0 text-white transition-opacity duration-300 {isSidebarHovered ? 'opacity-100' : 'opacity-0 hidden'}">{appName}</span>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
      {#each tabs as tab}
        <button
          type="button"
          class="w-full flex items-center {isSidebarHovered ? 'px-3.5 justify-start' : 'px-0 justify-center'} py-2.5 text-sm font-semibold rounded-lg transition-all duration-150 {activeTab === tab.name ? 'bg-[#2563eb] text-white shadow-md' : 'text-gray-200 hover:bg-white/10 hover:text-white'}"
          on:click={() => setActiveTab(tab.name)}
          title={!isSidebarHovered ? tab.name : ''}
          aria-current={activeTab === tab.name ? 'page' : undefined}
        >
          <svg class="shrink-0 h-5 w-5 {activeTab === tab.name ? 'text-white' : 'text-cyan-400'} {isSidebarHovered ? 'mr-3.5' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
          </svg>
          <span class="whitespace-nowrap font-medium transition-opacity duration-300 {isSidebarHovered ? 'opacity-100' : 'opacity-0 hidden'}">{tab.name}</span>
        </button>
      {/each}
    </nav>

    <div class="crm-ui-shell-account">
      <div class="flex items-center w-full {isSidebarHovered ? 'justify-between' : 'justify-center'}">
        <button
          type="button"
          class="flex items-center text-left {isSidebarHovered ? 'flex-1 min-w-0 mr-2' : ''}"
          aria-label="Switch organization"
          aria-expanded={showOrgSwitcher}
          on:click={() => {
            isSidebarHovered = true;
            showOrgSwitcher = !showOrgSwitcher;
          }}
        >
          <span class="crm-ui-shell-avatar shrink-0">
            C
          </span>
          <span class="ml-3 flex-1 min-w-0 transition-opacity duration-300 {isSidebarHovered ? 'opacity-100' : 'opacity-0 hidden w-0 overflow-hidden'}">
            <span class="text-sm font-medium text-white flex items-center">
              <span class="truncate">{appName}</span>
              <svg class="w-4 h-4 ml-1 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <span class="block text-xs text-gray-400 truncate">Switch organization</span>
          </span>
        </button>
        <button
          type="button"
          class="crm-ui-shell-signout-icon shrink-0 {isSidebarHovered ? 'block' : 'hidden'}"
          on:click={() => showLogoutModal = true}
          aria-label="Sign out"
          title="Sign out"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {#if showOrgSwitcher && $availableTenants.length > 0}
        <div class="crm-ui-shell-org-menu">
          {#each $availableTenants as tenant, index}
            <button
              type="button"
              class="w-full text-left px-4 py-2 text-sm {$tenantIdStore === tenant ? 'bg-[#2563eb] text-white font-semibold' : 'text-gray-300 hover:bg-white/10 hover:text-white'} whitespace-nowrap"
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
  <main class="crm-ui-shell-main">
    <!-- Top Bar -->
    <header class="crm-ui-shell-header">
      <button
        type="button"
        bind:this={mobileMenuTrigger}
        class="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50 md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={showMobileMenu}
        on:click={() => showMobileMenu = true}
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <CrmBreadcrumbs items={breadcrumbItems} />
      <div class="max-w-lg flex-1 sm:px-4 lg:px-8">
        <div class="relative group">
          <div class="crm-ui-shell-search-icon">
            <svg class="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
          </div>
          <button
            type="button"
            bind:this={globalSearchTrigger}
            class="crm-ui-shell-search"
            aria-describedby={globalSearchLoadError ? 'global-search-error' : undefined}
            aria-label="Search across HuddleWay (Cmd+K)"
            on:click={openGlobalSearch}
          >
            <span class="sm:hidden">Search</span>
            <span class="hidden sm:inline">Search across HuddleWay (Cmd+K)</span>
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

    <div class="flex-1 flex flex-col">
      {#if brandingState === 'error' || brandingState === 'permission'}
        <p class="crm-ui-shell-brand-error" role="alert">{brandingMessage}</p>
      {:else if brandingState === 'missing'}
        <p class="sr-only" role="status">{brandingMessage}</p>
      {/if}
      <slot />
    </div>
  </main>

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
                <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 class="crm-ui-modal-title" id="modal-title">
                  Sign Out
                </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500">
                    Are you sure you want to sign out? You will need to log back in to manage your organization.
                  </p>
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
