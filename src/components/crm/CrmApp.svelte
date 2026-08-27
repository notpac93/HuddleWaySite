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

  const tabLoaders: Record<string, () => Promise<{ default: Component<any> }>> = {
    Dashboard: () => import('./GlobalDashboard.svelte'),
    Teams: () => import('./TeamsManager.svelte'),
    Seasons: () => import('./seasons/SeasonsManager.svelte'),
    Registration: () => import('./registration/RegistrationManager.svelte'),
    Roster: () => import('./roster/RosterManager.svelte'),
    Rostering: () => import('./roster/RosterManager.svelte'),
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

  const documentIcon = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
  const tenantOperationsTab = {
    name: 'Tenant Operations',
    icon: 'M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M5 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
  };
  const globalTabs = [
    { name: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Teams', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { name: 'Seasons', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
    { name: 'Roster', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { name: 'Events', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'Registration', icon: documentIcon },
    { name: 'Financials', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { name: 'Messages', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { name: 'Documents', icon: documentIcon },
    { name: 'Staff', icon: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z' },
    { name: 'Media', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'My App', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { name: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { name: 'Activity', icon: 'M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M5 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' }
  ];

  const teamTabs = [
    globalTabs[2],
    globalTabs[6],
    globalTabs[5],
    { ...globalTabs[3], name: 'Rostering' },
    globalTabs[4],
    globalTabs[7],
    globalTabs[8],
    globalTabs[12],
  ];

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
  $: visibleTeamTabs = teamTabs.filter(
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
        : activeTeam
          ? visibleTeamTabs
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
      ? { activeTeam, setActiveTeam, activeResultId, onTargetConsumed }
      : {}),
    ...(activeTab === 'Seasons' ? { activeTeam } : {}),
    ...(activeTab === 'Roster' || activeTab === 'Rostering'
      ? { activeTeam, setActiveTeam, activeResultId, onTargetConsumed }
      : {}),
    ...(activeTab === 'Events'
      ? { activeTeam, activeResultId, onTargetConsumed, onStartRegistrationEmail }
      : {}),
    ...(activeTab === 'Messages'
      ? { registrationEmailDraft }
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
    activeTab = 'Rostering'; // default tab for a team
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

  async function handleTenantSwitch(tenantId: string) {
    if (!tenantId || tenantId === $tenantIdStore) return;

    isTenantSwitching = true;
    moduleLoadSequence += 1;
    activeComponent = null;
    requestedTab = '';
    loadedTab = '';
    moduleLoadError = '';
    activeTeam = null;
    activeResultId = null;
    activeTab = 'Dashboard';

    // Remove all tenant-scoped child component state before publishing the new
    // tenant ID to store subscribers.
    await tick();
    tenantIdStore.set(tenantId);
    isTenantSwitching = false;
  }
</script>

{#if $isAuthLoading}
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  </div>
{:else if !$userStore}
  <Login />
{:else if $authErrorStore}
  <div class="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div class="max-w-lg rounded-lg border border-red-200 bg-white p-8 shadow text-center">
      <h1 class="text-xl font-semibold text-gray-900">Access could not be verified</h1>
      <p class="mt-2 text-sm text-red-700">{$authErrorStore}</p>
      <div class="mt-6 flex justify-center gap-3">
        <button
          type="button"
          class="rounded-md bg-[#00a4bd] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#008194]"
          on:click={async () => {
            try {
              await signOut(auth);
            } catch {}
            authErrorStore.set('');
          }}
        >
          Sign out & try again
        </button>
      </div>
    </div>
  </div>
{:else if (
  (!$tenantIdStore || !$activeTenantRole)
  && !$canViewTenantOperationsStore
)}
  {#if $userStore.emailVerified}
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div class="max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow">
        <h1 class="text-xl font-semibold text-gray-900">Organization setup is managed by HuddleWay</h1>
        <p class="mt-2 text-sm text-gray-600">
          Your verified account is ready for an organization, but setup is currently being completed by the HuddleWay team.
        </p>
      </div>
    </div>
  {:else}
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div class="max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow">
        <h1 class="text-xl font-semibold text-gray-900">Verify your email to continue</h1>
        <p class="mt-2 text-sm text-gray-600">
          Program setup is free. Verify the email address on this account, then sign in again to create your organization.
        </p>
      </div>
    </div>
  {/if}
{:else if !canViewCrm}
  <div class="min-h-screen flex items-center justify-center bg-gray-50 p-6">
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
          class="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          on:click={retryActiveTab}
        >
          Try again
        </button>
      </div>
    {:else}
      <div class="flex min-h-64 items-center justify-center p-8" role="status">
        <span class="sr-only">Loading {activeTab}</span>
        <div class="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-b-indigo-600"></div>
      </div>
    {/if}
</CrmShell>
{/if}
