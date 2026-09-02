<script lang="ts">
  import { tick, type Component } from 'svelte';
  import { signOut } from 'firebase/auth';
  import { auth } from '../../lib/firebase';
  import { getToken as getAppCheckToken } from 'firebase/app-check';
  import {
    activeTenantRole,
    authErrorStore,
    canViewTenantOperationsStore,
    isAuthLoading,
    refreshAuthorization,
    tenantIdStore,
    tenantOperationsRoleStore,
    userStore,
  } from '../../lib/authStore';
  import { appCheck } from '../../lib/firebase';
  import { startCrmRumCapture } from '../../lib/performance/crmRum';
  import {
    readCrmContext,
    resolveAuthorizedPage,
    writeCrmContext,
  } from '../../lib/crm/crmContextPersistence';
  import type { PortalIconName } from '../../lib/ui/portalIcons';
  import Login from './Login.svelte';
  import CrmShell from './CrmShell.svelte';

  let activeTab = 'Dashboard';
  let activeTeam: any = null;
  let activeResultId: string | null = null;
  let activeComponent: Component<any> | null = null;
  let requestedTab = '';
  let loadedTab = '';
  let moduleLoadError = '';
  let moduleLoadSequence = 0;
  let isTenantSwitching = false;
  let rumStarted = false;
  let restoredContextKey = '';
  let registrationEmailDraft: {
    token: string;
    eventId: string;
    eventTitle: string;
  } | null = null;
  let mailboxConnectionResult = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('mailbox')
    : null;
  let mailboxReturnRequested = Boolean(mailboxConnectionResult);

  const tabLoaders: Record<string, () => Promise<{ default: Component<any> }>> = {
    Dashboard: () => import('./GlobalDashboard.svelte'),
    Teams: () => import('./TeamsManager.svelte'),
    Seasons: () => import('./seasons/SeasonsManager.svelte'),
    Registration: () => import('./registration/RegistrationManager.svelte'),
    Roster: () => import('./roster/RosterManager.svelte'),
    Events: () => import('./EventScheduler.svelte'),
    Financials: () => import('./FinancialOperationsWorkspace.svelte'),
    Staff: () => import('./StaffManager.svelte'),
    Media: () => import('./MediaManager.svelte'),
    'My App': () => import('./MyAppStudio.svelte'),
    Settings: () => import('./SettingsManager.svelte'),
    Activity: () => import('./ActivityManager.svelte'),
    Documents: () => import('./DocumentsManager.svelte'),
    Messages: () => import('./CommunicationsManager.svelte'),
    'Tenant Operations': () => import('./TenantOperations.svelte'),
    'Design System': () => import('./ui/PortalExperienceCatalog.svelte'),
  };

  async function loadActiveTab(tab: string) {
    const loader = tabLoaders[tab];
    requestedTab = tab;
    activeComponent = null;
    loadedTab = '';
    moduleLoadError = '';
    const sequence = ++moduleLoadSequence;

    if (!loader) {
      moduleLoadError = 'This CRM module is unavailable.';
      return;
    }

    try {
      const module = await loader();
      if (sequence !== moduleLoadSequence || requestedTab !== tab) return;
      activeComponent = module.default;
      loadedTab = tab;
    } catch {
      if (sequence !== moduleLoadSequence || requestedTab !== tab) return;
      console.error(`Could not load the ${tab} CRM module.`);
      moduleLoadError =
        `The ${tab} module could not be loaded. Check your connection and try again.`;
    }
  }

  function retryActiveTab() {
    requestedTab = '';
  }

  type PortalTab = {
    name: string;
    label?: string;
    icon: PortalIconName;
  };

  const tenantOperationsTab: PortalTab = {
    name: 'Tenant Operations',
    icon: 'tenantOperations',
  };
  const globalTabs: PortalTab[] = [
    { name: 'Dashboard', icon: 'dashboard' },
    { name: 'Teams', icon: 'teams' },
    { name: 'Seasons', icon: 'seasons' },
    { name: 'Roster', icon: 'roster' },
    { name: 'Events', icon: 'events' },
    { name: 'Registration', icon: 'registration' },
    { name: 'Financials', icon: 'financials' },
    { name: 'Messages', icon: 'messages' },
    { name: 'Documents', icon: 'documents' },
    { name: 'Staff', icon: 'staff' },
    { name: 'Media', icon: 'media' },
    { name: 'My App', icon: 'myApp' },
    { name: 'Settings', label: 'My profile', icon: 'profile' },
    { name: 'Activity', icon: 'activity' },
  ];
  if (
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('portal-catalog')
  ) {
    globalTabs.push({ name: 'Design System', icon: 'dashboard' });
  }

  const ownerOnlyTabs = new Set(['Financials', 'Staff', 'Activity']);
  $: isOwner =
    $activeTenantRole === 'owner'
    || $activeTenantRole === 'platform_admin';
  $: canManageTenant = isOwner || $activeTenantRole === 'editor';
  $: canViewTenant =
    canManageTenant || $activeTenantRole === 'viewer';
  $: canViewCrm = canViewTenant || $canViewTenantOperationsStore;
  $: visibleGlobalTabs = globalTabs.filter(
    (tab) =>
      canManageTenant
      && (isOwner || !ownerOnlyTabs.has(tab.name)),
  );
  // The Dashboard is the one module whose viewer surface has been fully
  // reduced to read-only controls. Do not expose write-capable modules until
  // each has an explicit viewer presentation.
  $: tenantTabsWithOperations = $canViewTenantOperationsStore
    ? [...visibleGlobalTabs, tenantOperationsTab]
    : visibleGlobalTabs;
  $: currentTabs =
    $tenantOperationsRoleStore === 'platform_operations_viewer'
      ? [tenantOperationsTab]
      : $activeTenantRole === 'viewer'
        ? [globalTabs[0]]
        : tenantTabsWithOperations;
  $: contextKey =
    $userStore?.uid && $tenantIdStore
      ? `${$userStore.uid}:${$tenantIdStore}`
      : '';
  $: if (
    canViewCrm
    && contextKey
    && currentTabs.length > 0
    && restoredContextKey !== contextKey
  ) {
    const allowedPages = currentTabs.map((tab) => tab.name);
    const persistedContext = readCrmContext($userStore?.uid);
    activeTab = resolveAuthorizedPage(
      persistedContext,
      $tenantIdStore,
      allowedPages,
    );
    if (mailboxReturnRequested && allowedPages.includes('Messages')) {
      activeTab = 'Messages';
      mailboxReturnRequested = false;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('mailbox');
      window.history.replaceState({}, '', cleanUrl);
    }
    activeResultId = null;
    restoredContextKey = contextKey;
  }
  $: contextReady = Boolean(contextKey && restoredContextKey === contextKey);
  $: if (
    contextReady
    && $userStore?.uid
    && $tenantIdStore
    && currentTabs.some((tab) => tab.name === activeTab)
  ) {
    writeCrmContext($userStore.uid, {
      tenantId: $tenantIdStore,
      page: activeTab,
    });
  }
  $: activeComponentProps = {
    ...(activeTab === 'Teams'
      ? {
          activeTeam,
          setActiveTeam,
          activeResultId,
          onTargetConsumed,
          onNavigateTab: (tab: string) => {
            activeResultId = null;
            activeTab = tab;
          },
        }
      : {}),
    ...(activeTab === 'Seasons' ? { activeTeam } : {}),
    ...(activeTab === 'Roster'
      ? { activeTeam, setActiveTeam, activeResultId, onTargetConsumed }
      : {}),
    ...(activeTab === 'Events'
      ? { activeTeam, activeResultId, onTargetConsumed, onStartRegistrationEmail }
      : {}),
    ...(activeTab === 'Messages'
      ? { registrationEmailDraft, mailboxConnectionResult }
      : {}),
    ...(activeTab === 'Financials'
      ? { activeTeam }
      : {}),
  };
  $: if (
    canViewCrm
    && currentTabs.length > 0
    && !currentTabs.some((tab) => tab.name === activeTab)
  ) {
    activeTab = currentTabs[0].name;
  }
  $: if (
    canViewCrm
    && contextReady
    && !isTenantSwitching
    && $userStore
    && ($tenantIdStore || activeTab === 'Tenant Operations')
    && activeTab
    && requestedTab !== activeTab
  ) {
    void loadActiveTab(activeTab);
  }
  $: if (
    !rumStarted
    && canViewTenant
    && $userStore
    && $tenantIdStore
  ) {
    rumStarted = true;
    const user = $userStore;
    startCrmRumCapture($tenantIdStore, async () => ({
      authorization: await user.getIdToken(false),
      appCheck: appCheck
        ? (await getAppCheckToken(appCheck, false)).token
        : '',
    }));
  }
  function setActiveTeam(team: any) {
    activeResultId = null;
    activeTeam = team;
    activeTab = 'Teams';
  }

  function onTargetConsumed(id: string) {
    if (activeResultId === id) activeResultId = null;
  }

  function onStartRegistrationEmail(draft: Omit<NonNullable<typeof registrationEmailDraft>, 'token'>) {
    registrationEmailDraft = {
      ...draft,
      token: `${draft.eventId}:${Date.now()}`,
    };
    activeTab = 'Messages';
  }

  function handleExitTeam() {
    activeResultId = null;
    activeTeam = null;
    activeTab = 'Teams';
  }

  async function handleTenantSwitch(tenantId: string, preferredTab = activeTab) {
    if (!tenantId || tenantId === $tenantIdStore) return;

    isTenantSwitching = true;
    moduleLoadSequence += 1;
    activeComponent = null;
    requestedTab = '';
    loadedTab = '';
    moduleLoadError = '';
    activeTeam = null;
    activeResultId = null;
    activeTab = tabLoaders[preferredTab] ? preferredTab : 'Dashboard';

    // Remove all tenant-scoped child component state before publishing the new
    // tenant ID to store subscribers.
    await tick();
    tenantIdStore.set(tenantId);
    isTenantSwitching = false;
  }
</script>

{#if $isAuthLoading}
  <div class="crm-theme-default-host min-h-screen flex items-center justify-center bg-gray-50">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--crm-brand-primary)]"></div>
  </div>
{:else if !$userStore}
  <Login />
{:else if $authErrorStore}
  <div class="crm-theme-default-host min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div class="max-w-lg rounded-lg border border-red-200 bg-white p-8 shadow text-center">
      <h1 class="text-xl font-semibold text-gray-900">Access could not be verified</h1>
      <p class="mt-2 text-sm text-red-700">{$authErrorStore}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          class="rounded-md bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-medium text-[var(--crm-on-primary)] shadow hover:bg-[var(--crm-brand-primary-hover)]"
          on:click={() => refreshAuthorization($userStore)}
        >
          Retry access
        </button>
        <button
          type="button"
          class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          on:click={async () => {
            try {
              await signOut(auth);
            } catch {}
            authErrorStore.set('');
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
{:else if (
  (!$tenantIdStore || !$activeTenantRole)
  && !$canViewTenantOperationsStore
)}
  {#if $userStore.emailVerified}
    <div class="crm-theme-default-host min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div class="max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow">
        <h1 class="text-xl font-semibold text-gray-900">Organization setup is managed by HuddleWay</h1>
        <p class="mt-2 text-sm text-gray-600">
          Your verified account is ready for an organization, but setup is currently being completed by the HuddleWay team.
        </p>
      </div>
    </div>
  {:else}
    <div class="crm-theme-default-host min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div class="max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow">
        <h1 class="text-xl font-semibold text-gray-900">Verify your email to continue</h1>
        <p class="mt-2 text-sm text-gray-600">
          Program setup is free. Verify the email address on this account, then sign in again to create your organization.
        </p>
      </div>
    </div>
  {/if}
{:else if !canViewCrm}
  <div class="crm-theme-default-host min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div class="max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow">
      <h1 class="text-xl font-semibold text-gray-900">Unsupported organization role</h1>
      <p class="mt-2 text-sm text-gray-600">
        This account's organization role is not supported by this CRM release.
      </p>
    </div>
  </div>
{:else}
  <CrmShell
    bind:activeTab
    bind:activeResultId
    tabs={currentTabs}
    {activeTeam}
    onExitTeam={handleExitTeam}
    onSwitchTenant={handleTenantSwitch}
  >
    {#if activeComponent && loadedTab === activeTab}
      <svelte:component this={activeComponent} {...activeComponentProps} />
    {:else if moduleLoadError}
      <div
        class="m-6 rounded-lg border border-red-200 bg-white p-6 shadow-sm"
        role="alert"
      >
        <h2 class="text-base font-semibold text-gray-900">Module unavailable</h2>
        <p class="mt-2 text-sm text-red-700">{moduleLoadError}</p>
        <button
          type="button"
          class="mt-4 rounded-md bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-medium text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-brand-focus)] focus:ring-offset-2"
          on:click={retryActiveTab}
        >
          Try again
        </button>
      </div>
    {:else}
      <div class="flex min-h-64 items-center justify-center p-8" role="status">
        <span class="sr-only">Loading {activeTab}</span>
        <div class="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-b-[var(--crm-brand-primary)]"></div>
      </div>
    {/if}
</CrmShell>
{/if}
