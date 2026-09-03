<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { tenantIdStore, tenantNamesStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    publicEnvironment,
    resolveCrmAppPreviewUrl,
  } from '../../lib/config/publicEnvironment';
  import {
    BackendApiError,
    createIdempotencyKey,
    type CrmAppConfiguration,
  } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import ImageFilePicker from './ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../lib/media/imageUpload';
  import {
    describeAppConfigurationChanges,
    hasDuplicateTabLabels,
  } from '../../lib/ui/appConfigurationReview';
  import {
    clearPortalDraft,
    registerPortalDraft,
  } from '../../lib/ui/portalDraftGuard';
  import AppPublishReview from './app/AppPublishReview.svelte';
  import { eventsStore, teamsStore } from '../../lib/services/DataStore';


  // Form Configurator State
  let primaryColor = '';
  let secondaryColor = '';
  let tertiaryColor = '';
  let appName = '';
  type NavigationTabDraft = CrmAppConfiguration['navigationTabs'][number];

  let tabsConfig: NavigationTabDraft[] = [];
  let logoUrl = null;
  let logoFile: File | null = null;
  let logoPreviewDataUrl: string | null = null;
  let logoPreviewSequence = 0;
  let logoValidationMessage = '';
  let configVersionToken = '';
  let loadedConfiguration: CrmAppConfiguration | null = null;
  let configMode: 'initialize' | 'update' = 'initialize';
  let configLoadState: 'idle' | 'loading' | 'ready' | 'error' | 'permission' = 'idle';
  let configLoadMessage = '';
  let loadedConfigSignature = '';
  let configLoadSequence = 0;
  let publishMessage = '';
  let draftNotice = '';
  let publishRequestId = '';
  let publishIdempotencyKey = createIdempotencyKey('app-configuration-publish');
  let publishAttemptSignature = '';
  let currentConfigSignature = '';
  let currentAttemptSignature = '';
  let activeTenantId = '';
  let previewFrame: HTMLIFrameElement | null = null;
  let previewLoadState: 'idle' | 'loading' | 'ready' = 'idle';
  let previewDraftSyncState: 'idle' | 'awaiting' | 'synced' = 'idle';
  let previewDraftRetryTimers: number[] = [];
  let showPublishReview = false;
  let savedDraft: {
    versionToken: string;
    savedAt: string;
    configuration: CrmAppConfiguration;
  } | null = null;
  type AppVersion = { id: string; configVersion: number; publishedAt: string | null; publishedBy: string | null; publishedByLabel?: string | null; auditReason: string | null; configuration: CrmAppConfiguration };
  let configVersion = 0;
  let publishedAt: string | null = null;
  let publishedByLabel: string | null = null;
  let versionHistory: AppVersion[] = [];
  let versionHistoryState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let versionHistoryTruncated = false;
  let brandingUndoSnapshot: Pick<CrmAppConfiguration, 'name' | 'primaryColor' | 'secondaryColor' | 'tertiaryColor'> | null = null;
  let reviewChanges: string[] = [];

  const previewBaseUrl = resolveCrmAppPreviewUrl(publicEnvironment);

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  const initialTabs = [
    { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
    { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'Teams', enabled: true },
    { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
    { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
    { key: 'events', pageId: 'events_page', route: '/events', label: 'Events', enabled: true },
  ];
  const maxActiveTabs = 5;
  const approvedPalettes = [
    { name: 'HuddleWay blue', primary: '#0F4C81', secondary: '#245BD6', tertiary: '#F59E0B' },
    { name: 'Field green', primary: '#166534', secondary: '#16A34A', tertiary: '#FACC15' },
    { name: 'Club burgundy', primary: '#7F1D1D', secondary: '#DC2626', tertiary: '#F59E0B' },
  ];
  const missingTabPriority = ['home', 'teams', 'schedule', 'messaging', 'events'];
  const permanentTabNames: Record<string, string> = {
    home: 'Home',
    teams: 'Teams',
    events: 'Events',
    messaging: 'Board',
    schedule: 'Schedule',
    resources: 'Resources',
    staff: 'Staff',
    account: 'Account',
    contact: 'Contact',
  };

  function permanentTabName(tab: NavigationTabDraft) {
    const knownName = permanentTabNames[tab.key];
    if (knownName) return knownName;
    // Legacy tenant configurations used a team-specific key and route for the
    // Teams slot. All other supported system purposes are named above, so an
    // unrecognized content tab is the tenant's Teams tab—not a tenant brand.
    return 'Teams';
  }

  function completeFiveTabSlots(tabs: NavigationTabDraft[]) {
    const completed = tabs.map((tab) => ({ ...tab }));
    for (const key of missingTabPriority) {
      if (completed.length >= maxActiveTabs) break;
      const candidate = initialTabs.find((tab) => tab.key === key);
      const alreadyHasTeamsPurpose = key === 'teams' && completed.some(
        (tab) => permanentTabName(tab) === 'Teams',
      );
      if (
        candidate
        && !alreadyHasTeamsPurpose
        && !completed.some(
          (tab) => tab.key === candidate.key || tab.route === candidate.route,
        )
      ) {
        completed.push({ ...candidate });
      }
    }
    return completed;
  }

  function buildConfigSignature() {
    return JSON.stringify({
      appName: appName.trim(),
      primaryColor: primaryColor.toLowerCase(),
      secondaryColor: secondaryColor.toLowerCase(),
      tertiaryColor: tertiaryColor.toLowerCase(),
      tabsConfig,
      logoUrl,
    });
  }

  function currentConfiguration(): CrmAppConfiguration {
    return {
      name: appName.trim(),
      primaryColor,
      secondaryColor,
      tertiaryColor,
      logoUrl,
      navigationTabs: tabsConfig.map((tab) => ({ ...tab, label: tab.label.trim() })),
    };
  }

  function buildAttemptSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      configuration: buildConfigSignature(),
      logoFile: logoFile
        ? { name: logoFile.name, type: logoFile.type, size: logoFile.size }
        : null,
      configMode,
      configVersionToken,
    });
  }

  $: {
    appName;
    primaryColor;
    secondaryColor;
    tertiaryColor;
    tabsConfig;
    logoUrl;
    logoFile;
    currentConfigSignature = buildConfigSignature();
  }
  $: isDirty =
    configLoadState === 'ready'
    && (
      currentConfigSignature !== loadedConfigSignature
      || Boolean(logoFile)
    );
  $: configIsValid =
    appName.trim().length > 0
    && appName.trim().length <= 160
    && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    && /^#[0-9a-fA-F]{6}$/.test(secondaryColor)
    && /^#[0-9a-fA-F]{6}$/.test(tertiaryColor)
    && tabsConfig.length > 0
    && tabsConfig.length <= 12
    && tabsConfig.filter((tab) => tab.enabled).length <= maxActiveTabs
    && !hasDuplicateTabLabels(currentConfiguration())
    && new Set(tabsConfig.map((tab) => tab.key)).size === tabsConfig.length
    && tabsConfig.every(
      (tab) =>
        tab.key
        && tab.pageId
        && tab.label.trim()
        && tab.label.length <= 80
        && tab.route?.startsWith('/')
        && !tab.route.startsWith('//'),
    );
  $: activeTabCount = tabsConfig.filter((tab) => tab.enabled).length;
  $: {
    // Svelte cannot infer the form dependencies hidden inside
    // currentConfiguration(). Key this review projection to the explicit
    // signature so nested tab-label edits are always included.
    currentConfigSignature;
    reviewChanges = describeAppConfigurationChanges(
      configMode === 'initialize' ? null : loadedConfiguration,
      currentConfiguration(),
    );
  }
  $: selectedOrganizationName = $tenantNamesStore[activeTenantId]
    || activeTenantId
    || 'the selected organization';
  $: versionLabel = configMode === 'initialize'
    ? 'Initial configuration'
    : `Authoritative version ${configVersionToken.slice(0, 8)}…`;
  $: canPublish =
    configLoadState === 'ready'
    && Boolean(configVersionToken)
    && configIsValid
    && isDirty
    && submitState !== 'loading';
  $: currentAttemptSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    configuration: currentConfigSignature,
    logoFile: logoFile
      ? { name: logoFile.name, type: logoFile.type, size: logoFile.size }
      : null,
    configMode,
    configVersionToken,
  });
  $: previewPayload = JSON.stringify({
    type: 'huddleway.crm.preview.update',
    tenantId: String($tenantIdStore || ''),
    configuration: {
      name: appName.trim(),
      primaryColor,
      secondaryColor,
      tertiaryColor,
      logoUrl: logoPreviewDataUrl || logoUrl,
      navigationTabs: tabsConfig.map((tab) => ({
        ...tab,
        label: tab.label.trim(),
      })),
    },
  });
  $: previewSrc = buildPreviewSrc(String($tenantIdStore || ''));
  $: logoFile, refreshLogoPreview(logoFile);
  $: {
    previewPayload;
    if (previewFrame && configLoadState === 'ready') {
      queueMicrotask(postPreviewDraft);
    }
  }
  $: {
    const signature = currentAttemptSignature;
    if (signature !== publishAttemptSignature && submitState !== 'loading') {
      publishAttemptSignature = signature;
      publishIdempotencyKey = createIdempotencyKey('app-configuration-publish');
      if (submitState !== 'idle') submitState = 'idle';
      publishMessage = '';
      publishRequestId = '';
    }
  }

  // Active Tab in the left pane
  let activeTab = 'Branding';
  const tabs = ['Branding', 'Pages', 'Version history'];

  $: if (String($tenantIdStore || '') !== activeTenantId) {
    activeTenantId = String($tenantIdStore || '');
    configLoadSequence += 1;
    primaryColor = '';
    secondaryColor = '';
    tertiaryColor = '';
    appName = '';
    tabsConfig = [];
    logoUrl = null;
    logoFile = null;
    logoPreviewDataUrl = null;
    logoValidationMessage = '';
    loadedConfigSignature = '';
    configVersionToken = '';
    configVersion = 0;
    publishedAt = null;
    publishedByLabel = null;
    versionHistory = [];
    versionHistoryState = 'idle';
    loadedConfiguration = null;
    savedDraft = null;
    showPublishReview = false;
    publishAttemptSignature = '';
    publishIdempotencyKey =
      createIdempotencyKey('app-configuration-publish');
    publishMessage = '';
    draftNotice = '';
    publishRequestId = '';
    submitState = 'idle';
    clearPreviewDraftRetries();
    previewLoadState = activeTenantId && previewBaseUrl ? 'loading' : 'idle';
    previewDraftSyncState = 'idle';
    if (activeTenantId) {
      loadTenantConfig(activeTenantId);
    } else {
      configLoadSequence += 1;
      configLoadState = 'idle';
      configLoadMessage = '';
    }
  }

  $: if (isDirty && activeTenantId) {
    registerPortalDraft({
      id: 'my-app-configuration',
      title: 'Unpublished family app changes',
      message: 'You can stay, discard the changes, or save a browser draft before leaving this page.',
      retainLabel: 'Save draft and leave',
      onDiscard: discardLocalChanges,
      onRetain: retainLocalDraft,
    });
  } else {
    clearPortalDraft('my-app-configuration');
  }

  onDestroy(() => clearPortalDraft('my-app-configuration'));

  function buildPreviewSrc(tenantId: string) {
    if (!previewBaseUrl || !tenantId) return '';
    const url = new URL('/', previewBaseUrl);
    url.searchParams.set('forcedTenant', tenantId);
    url.searchParams.set('crmPreview', '1');
    return url.toString();
  }

  function postPreviewDraft() {
    if (
      !previewFrame?.contentWindow
      || !previewBaseUrl
      || configLoadState !== 'ready'
    ) return;
    previewDraftSyncState = 'awaiting';
    previewFrame.contentWindow.postMessage(previewPayload, previewBaseUrl);
  }

  function handlePreviewLoad() {
    previewLoadState = 'ready';
    postPreviewDraft();
    clearPreviewDraftRetries();
    previewDraftRetryTimers = [750, 2000, 5000].map((delay) =>
      window.setTimeout(() => {
        if (
          previewLoadState === 'ready'
          && activeTenantId === String($tenantIdStore || '')
        ) {
          postPreviewDraft();
        }
      }, delay));
  }

  function clearPreviewDraftRetries() {
    for (const timer of previewDraftRetryTimers) window.clearTimeout(timer);
    previewDraftRetryTimers = [];
  }

  onMount(() => {
    const handlePreviewReady = (event: MessageEvent) => {
      if (
        !previewBaseUrl
        || event.origin !== previewBaseUrl
        || event.source !== previewFrame?.contentWindow
      ) return;
      try {
        const payload = typeof event.data === 'string'
          ? JSON.parse(event.data)
          : event.data;
        if (
          payload?.type === 'huddleway.crm.preview.ready'
          && payload?.tenantId === String($tenantIdStore || '')
        ) {
          postPreviewDraft();
        } else if (
          payload?.type === 'huddleway.crm.preview.applied'
          && payload?.tenantId === String($tenantIdStore || '')
        ) {
          previewDraftSyncState = 'synced';
        }
      } catch {
        // Ignore unrelated or malformed cross-window messages.
      }
    };
    window.addEventListener('message', handlePreviewReady);
    return () => {
      clearPreviewDraftRetries();
      window.removeEventListener('message', handlePreviewReady);
    };
  });

  function refreshLogoPreview(file: File | null) {
    const sequence = ++logoPreviewSequence;
    if (!file) {
      logoPreviewDataUrl = null;
      return;
    }
    const validationMessage = validateImageFile(file);
    if (validationMessage) {
      logoPreviewDataUrl = null;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (sequence !== logoPreviewSequence) return;
      logoPreviewDataUrl = typeof reader.result === 'string'
        ? reader.result
        : null;
    };
    reader.onerror = () => {
      if (sequence === logoPreviewSequence) logoPreviewDataUrl = null;
    };
    reader.readAsDataURL(file);
  }

  function appConfigurationLoadMessage(error: unknown) {
    const code = String((error as { code?: unknown })?.code || '').toLowerCase();
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      code.includes('auth/')
      || message.includes('sign in to continue')
      || message.includes('authenticated session')
    ) {
      return 'Your administrator session is still loading. Retry in a moment.';
    }
    if (
      code.includes('network')
      || message.includes('failed to fetch')
      || message.includes('network')
    ) {
      return 'The app configuration service could not be reached. Retry in a moment.';
    }
    if (error instanceof BackendApiError && error.status === 403) {
      return 'You do not have permission to edit app configuration.';
    }
    if (error instanceof BackendApiError && error.status >= 500) {
      return 'The app configuration service returned an invalid response. Retry in a moment.';
    }
    return 'The authoritative app configuration could not be loaded. Publishing is disabled.';
  }

  function draftStorageKey(tenantId: string) {
    return `huddleway.crm.app-configuration-draft:${tenantId}`;
  }

  function retainLocalDraft() {
    if (!activeTenantId) return;
    const draft = {
      versionToken: configVersionToken,
      savedAt: new Date().toISOString(),
      configuration: currentConfiguration(),
    };
    window.localStorage.setItem(draftStorageKey(activeTenantId), JSON.stringify(draft));
    savedDraft = draft;
  }

  function removeLocalDraft() {
    if (activeTenantId) window.localStorage.removeItem(draftStorageKey(activeTenantId));
    savedDraft = null;
  }

  function discardLocalChanges() {
    if (loadedConfiguration) {
      appName = loadedConfiguration.name;
      primaryColor = loadedConfiguration.primaryColor;
      secondaryColor = loadedConfiguration.secondaryColor;
      tertiaryColor = loadedConfiguration.tertiaryColor;
      logoUrl = loadedConfiguration.logoUrl;
      tabsConfig = loadedConfiguration.navigationTabs.map((tab) => ({ ...tab }));
    }
    logoFile = null;
    removeLocalDraft();
  }

  function captureBrandingUndo() {
    brandingUndoSnapshot = { name: appName, primaryColor, secondaryColor, tertiaryColor };
  }

  function applyPalette(palette: typeof approvedPalettes[number]) {
    captureBrandingUndo();
    primaryColor = palette.primary;
    secondaryColor = palette.secondary;
    tertiaryColor = palette.tertiary;
  }

  function undoBrandingChange() {
    if (!brandingUndoSnapshot) return;
    const prior = brandingUndoSnapshot;
    brandingUndoSnapshot = { name: appName, primaryColor, secondaryColor, tertiaryColor };
    appName = prior.name;
    primaryColor = prior.primaryColor;
    secondaryColor = prior.secondaryColor;
    tertiaryColor = prior.tertiaryColor;
  }

  function moveTab(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tabsConfig.length) return;
    const next = [...tabsConfig];
    [next[index], next[target]] = [next[target], next[index]];
    tabsConfig = next;
  }

  function activeContentCount(tab: NavigationTabDraft) {
    if (tab.key === 'events') return $eventsStore.length;
    if (tab.key === 'schedule') return $eventsStore.filter((event) => !['cancelled', 'archived'].includes(String(event.status || event.lifecycleStatus || '').toLowerCase())).length;
    if (tab.key === 'teams' || permanentTabName(tab) === 'Teams') return $teamsStore.length;
    return 0;
  }

  function useVersionAsRollbackDraft(version: AppVersion) {
    captureBrandingUndo();
    const configuration = version.configuration;
    appName = configuration.name;
    primaryColor = configuration.primaryColor;
    secondaryColor = configuration.secondaryColor;
    tertiaryColor = configuration.tertiaryColor;
    logoUrl = configuration.logoUrl;
    tabsConfig = configuration.navigationTabs.map((tab) => ({ ...tab }));
    activeTab = 'Branding';
    draftNotice = `Version ${version.configVersion} is loaded as an unpublished rollback draft. Review the preview and publish to make it current.`;
  }

  async function loadVersionHistory(tenantId: string) {
    versionHistoryState = 'loading';
    try {
      const result = await backendClient.appConfigurationHistory(tenantId);
      if ($tenantIdStore !== tenantId) return;
      versionHistory = result.versions;
      versionHistoryTruncated = result.truncated;
      versionHistoryState = 'ready';
    } catch {
      if ($tenantIdStore !== tenantId) return;
      versionHistoryState = 'error';
    }
  }

  function readLocalDraft(tenantId: string) {
    try {
      const raw = window.localStorage.getItem(draftStorageKey(tenantId));
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (
        !draft
        || typeof draft.versionToken !== 'string'
        || typeof draft.savedAt !== 'string'
        || !draft.configuration
        || !Array.isArray(draft.configuration.navigationTabs)
      ) return null;
      return draft as typeof savedDraft;
    } catch {
      return null;
    }
  }

  function restoreLocalDraft() {
    if (!savedDraft || savedDraft.versionToken !== configVersionToken) return;
    const configuration = savedDraft.configuration;
    appName = configuration.name;
    primaryColor = configuration.primaryColor;
    secondaryColor = configuration.secondaryColor;
    tertiaryColor = configuration.tertiaryColor;
    logoUrl = configuration.logoUrl;
    tabsConfig = configuration.navigationTabs.map((tab) => ({ ...tab }));
    savedDraft = null;
  }

  async function loadTenantConfig(tenantId) {
    const sequence = ++configLoadSequence;
    configLoadState = 'loading';
    configLoadMessage = '';
    configVersionToken = '';
    try {
      const snapshot = await backendClient.appConfiguration(tenantId);
      if (
        sequence !== configLoadSequence
        || $tenantIdStore !== tenantId
      ) return;
      if (snapshot.tenantId !== tenantId) {
        throw new Error('The configuration response did not match the selected organization.');
      }

      configMode = snapshot.mode;
      configVersion = snapshot.configVersion;
      publishedAt = snapshot.publishedAt;
      publishedByLabel = snapshot.publishedByLabel || (snapshot.publishedBy ? 'Portal administrator' : null);
      configVersionToken = snapshot.versionToken;
      if (snapshot.configuration) {
        const configuration = snapshot.configuration;
        primaryColor = configuration.primaryColor;
        secondaryColor = configuration.secondaryColor;
        tertiaryColor = configuration.tertiaryColor;
        appName = configuration.name;
        logoUrl = configuration.logoUrl;
        tabsConfig = configuration.navigationTabs.map((tab) => ({ ...tab }));
        loadedConfigSignature = buildConfigSignature();
        loadedConfiguration = currentConfiguration();
        tabsConfig = completeFiveTabSlots(tabsConfig);
      } else {
        primaryColor = '';
        secondaryColor = '';
        tertiaryColor = '';
        appName = '';
        logoUrl = null;
        // Defaults are offered only after the backend confirms initialize mode.
        tabsConfig = initialTabs.map((tab) => ({ ...tab }));
        loadedConfigSignature = buildConfigSignature();
        loadedConfiguration = currentConfiguration();
      }
      configLoadState = 'ready';
      savedDraft = readLocalDraft(tenantId);
      void loadVersionHistory(tenantId);
    } catch (e) {
      console.error('App configuration load failed.');
      if (
        sequence !== configLoadSequence
        || $tenantIdStore !== tenantId
      ) return;
      const code = String((e as { code?: unknown })?.code || '');
      configLoadState =
        (e instanceof BackendApiError && e.status === 403)
        || code.includes('permission-denied')
          ? 'permission'
          : 'error';
      configLoadMessage = appConfigurationLoadMessage(e);
      publishRequestId = e instanceof BackendApiError ? e.requestId || '' : '';
    }
  }

  async function handlePublish() {
    if (!canPublish || submitState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) return;

    logoValidationMessage = validateImageFile(logoFile);
    if (logoValidationMessage) {
      return;
    }
    if (logoFile) {
      publishMessage =
        'Logo upload is temporarily unavailable while publication privacy is being finalized. Remove the selected logo to publish other app settings safely.';
      submitState = 'error';
      return;
    }

    const expectedVersionToken = configVersionToken;
    const mode = configMode;
    submitState = 'loading';
    publishMessage = '';
    draftNotice = '';
    publishRequestId = '';
    try {
      const configuration: CrmAppConfiguration = {
        name: appName.trim(),
        primaryColor,
        secondaryColor,
        tertiaryColor,
        logoUrl,
        navigationTabs: tabsConfig.map((tab) => ({
          ...tab,
          label: tab.label.trim(),
        })),
      };
      const submittedSignature = JSON.stringify({
        appName: configuration.name,
        primaryColor: configuration.primaryColor.toLowerCase(),
        secondaryColor: configuration.secondaryColor.toLowerCase(),
        tertiaryColor: configuration.tertiaryColor.toLowerCase(),
        tabsConfig: configuration.navigationTabs,
        logoUrl: configuration.logoUrl,
      });
      await backendClient.publishAppConfiguration(
        tenantId,
        {
          ...configuration,
          mode,
          expectedVersionToken,
        },
        'Publish reviewed app branding and navigation configuration from CRM.',
        publishIdempotencyKey,
      );
      if ($tenantIdStore !== tenantId) return;
      logoFile = null;
      logoValidationMessage = '';
      await loadTenantConfig(tenantId);
      if ($tenantIdStore !== tenantId || configLoadState !== 'ready') return;
      if (loadedConfigSignature !== submittedSignature) {
        publishAttemptSignature = buildAttemptSignature();
        publishMessage =
          'The server readback did not match the reviewed configuration. Verify the current values before retrying.';
        submitState = 'error';
        return;
      }
      publishAttemptSignature = buildAttemptSignature();
      publishIdempotencyKey =
        createIdempotencyKey('app-configuration-publish');
      submitState = 'success';
      publishMessage = 'App configuration published and reloaded from the server.';
      removeLocalDraft();
    } catch (e) {
      console.error('App configuration publish failed.');
      if ($tenantIdStore !== tenantId) return;
      publishRequestId = e instanceof BackendApiError ? e.requestId || '' : '';
      if (e instanceof BackendApiError && e.status === 409) {
        await loadTenantConfig(tenantId);
        if ($tenantIdStore !== tenantId) return;
        publishAttemptSignature = buildAttemptSignature();
        publishIdempotencyKey =
          createIdempotencyKey('app-configuration-publish');
        publishMessage = 'This configuration changed on the server. The latest version has been loaded; review it before publishing again.';
      } else {
        publishMessage = 'The app configuration could not be published.';
      }
      submitState = 'error';
    }
  }

  function requestPublishReview() {
    if (!canPublish) return;
    showPublishReview = true;
  }

  function confirmPublish() {
    showPublishReview = false;
    void handlePublish();
  }

  const defaultLogoUrl = '/logo.webp';
  $: safeLogoPreviewUrl =
    typeof logoUrl === 'string'
    && (
      (logoUrl.startsWith('/') && !logoUrl.startsWith('//'))
      || /^https:\/\/[^/]/i.test(logoUrl)
    )
      ? logoUrl
      : defaultLogoUrl;

</script>

{#if showPublishReview}
  <AppPublishReview
    organizationName={selectedOrganizationName}
    {versionLabel}
    changes={reviewChanges}
    configuration={currentConfiguration()}
    busy={submitState === 'loading'}
    onCancel={() => showPublishReview = false}
    onConfirm={confirmPublish}
  />
{/if}

<div class="crm-ui-studio-root">

  <!-- Left Pane: Configuration Form -->
  <div class="crm-ui-studio-editor">
    <div class="px-8 pt-6 pb-4 border-b border-gray-200">
      <h2 class="crm-ui-page-title">My App</h2>
      <p class="text-sm text-gray-500 mt-1">Preview changes here, then publish them to your family app.</p>
      {#if configLoadState === 'ready'}
        <p class="mt-2 text-xs font-medium text-gray-600">Version {configVersion || 'initial'} · {versionLabel} · Previewing {isDirty ? 'unpublished draft' : 'published configuration'} · Last published {publishedAt ? new Date(publishedAt).toLocaleString() : 'not available'} by {publishedByLabel || 'publisher unavailable'}</p>
      {/if}
    </div>

    <div class="flex border-b border-gray-200 px-6 pt-2">
      {#each tabs as tab}
        <button
          type="button"
          disabled={submitState === 'loading'}
          aria-pressed={activeTab === tab}
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab !== tab ? 'border-transparent text-gray-500 hover:text-gray-700' : 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]'}"
          on:click={() => activeTab = tab}
        >
          {tab}
        </button>
      {/each}
    </div>

    {#if configLoadState === 'loading'}
      <p class="crm-ui-studio-loading" role="status">Loading authoritative app configuration…</p>
    {:else if configLoadState === 'error' || configLoadState === 'permission'}
      <div class="crm-ui-studio-error" role="alert">
        <p>{configLoadMessage}</p>
        {#if configLoadState === 'error' && activeTenantId}
          <button
            type="button"
            class="mt-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
            on:click={() => loadTenantConfig(activeTenantId)}
          >
            Retry
          </button>
        {/if}
      </div>
    {:else if configLoadState === 'ready' && !configVersionToken}
      <p class="crm-ui-studio-warning" role="status">
        Configuration loaded in {configMode} mode, but no concurrency token was returned. Publishing remains disabled.
      </p>
    {/if}

    {#if publishMessage}
      <div
        class="mx-6 mt-4 rounded-md border p-3 text-sm {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}"
        role={submitState === 'error' ? 'alert' : 'status'}
      >
        <p>{publishMessage}</p>
      </div>
    {/if}

    {#if draftNotice}
      <div class="mx-6 mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
        {draftNotice}
      </div>
    {/if}

    {#if savedDraft}
      <div class="mx-6 mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
        <p class="font-semibold">A browser draft was saved {new Date(savedDraft.savedAt).toLocaleString()}.</p>
        {#if savedDraft.versionToken === configVersionToken}
          <p class="mt-1">It matches the current authoritative version and can be restored safely.</p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="crm-ui-button-primary" on:click={restoreLocalDraft}>Restore draft</button>
            <button type="button" class="crm-ui-button-secondary bg-white" on:click={removeLocalDraft}>Discard saved draft</button>
          </div>
        {:else}
          <p class="mt-1">The server changed after this draft was saved. It cannot be restored because doing so could overwrite newer work.</p>
          <button type="button" class="crm-ui-button-secondary mt-3 bg-white" on:click={removeLocalDraft}>Discard outdated draft</button>
        {/if}
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-8 bg-gray-50/50">
      {#if activeTab === 'Branding'}
        <div class="space-y-6">


          <div>
            <label for="studio-app-name" class="block text-sm font-medium text-gray-700 mb-2">App Name</label>
            <input
              id="studio-app-name"
              type="text"
              bind:value={appName}
              on:focus={captureBrandingUndo}
              maxlength="160"
              disabled={submitState === 'loading'}
              class="crm-ui-studio-name"
            />
          </div>

        </div>
      {:else if activeTab === 'Pages'}
        <div class="space-y-6">
          <div class="crm-ui-studio-modules">
            <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 class="text-sm font-medium text-gray-900">App tabs</h3>
                <p class="mt-1 text-xs text-gray-500">
                  The permanent name identifies the tab's purpose. You can rename the tab families see.
                </p>
              </div>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-medium {activeTabCount > maxActiveTabs ? 'bg-red-100 text-red-800' : 'bg-emerald-50 text-emerald-800'}"
                aria-live="polite"
              >
                {activeTabCount} of {maxActiveTabs} active
              </span>
            </div>

            {#if activeTabCount > maxActiveTabs}
              <p class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
                The app can show up to five tabs. Turn off at least {activeTabCount - maxActiveTabs} tab{activeTabCount - maxActiveTabs === 1 ? '' : 's'} before publishing.
              </p>
            {/if}
            {#if hasDuplicateTabLabels(currentConfiguration())}
              <p class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">Active app tabs must have unique names so families can distinguish each destination.</p>
            {/if}

            <div class="space-y-4">
              {#each tabsConfig as tab, index (tab.key)}
                <div class="crm-ui-studio-module-row">
                  <div class="min-w-0 flex-1 pr-4">
                    <h4 class="text-sm font-semibold text-gray-900">
                      {permanentTabName(tab)}
                    </h4>
                    <input
                      id={`studio-tab-name-${tab.key}`}
                      type="text"
                      bind:value={tab.label}
                      aria-label={`Tab name for ${permanentTabName(tab)}`}
                      maxlength="80"
                      disabled={submitState === 'loading'}
                      class="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={submitState === 'loading'}
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {tab.enabled ? 'bg-[var(--crm-brand-control)]' : 'bg-gray-200'}"
                    aria-label={`${tab.enabled ? 'Hide' : 'Show'} ${permanentTabName(tab)} tab`}
                    aria-pressed={tab.enabled}
                    on:click={() => { tab.enabled = !tab.enabled; tabsConfig = tabsConfig; }}
                  >
                    <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {tab.enabled ? 'translate-x-5' : 'translate-x-0'}"></span>
                  </button>
                  <div class="ml-3 flex flex-col gap-1"><button type="button" aria-label={`Move ${permanentTabName(tab)} tab up`} disabled={submitState === 'loading' || index === 0} class="rounded border px-2 py-1 text-xs disabled:opacity-40" on:click={() => moveTab(index, -1)}>↑</button><button type="button" aria-label={`Move ${permanentTabName(tab)} tab down`} disabled={submitState === 'loading' || index === tabsConfig.length - 1} class="rounded border px-2 py-1 text-xs disabled:opacity-40" on:click={() => moveTab(index, 1)}>↓</button></div>
                  {#if tab.enabled && activeContentCount(tab) > 0}<p class="mt-2 basis-full text-xs text-amber-800">Hiding this tab would remove access to {activeContentCount(tab)} active {permanentTabName(tab).toLowerCase()} record{activeContentCount(tab) === 1 ? '' : 's'} from family navigation; the content itself is retained.</p>{/if}
                </div>
              {/each}

              {#if tabsConfig.length === 0}
                <p class="text-sm text-gray-500">No app tabs are configured for this program.</p>
              {/if}
            </div>
          </div>
        </div>
      {:else if activeTab === 'Version history'}
        <div class="space-y-4"><div><h3 class="font-semibold text-gray-900">Published versions</h3><p class="mt-1 text-sm text-gray-600">Load an earlier configuration as a draft, inspect it in the mobile preview, then use the normal reviewed publish flow to roll back safely.</p></div>{#if versionHistoryState === 'loading'}<p role="status" class="text-sm text-gray-500">Loading version history…</p>{:else if versionHistoryState === 'error'}<div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Version history could not be loaded. <button type="button" class="font-semibold underline" on:click={() => activeTenantId && loadVersionHistory(activeTenantId)}>Retry</button></div>{:else if versionHistory.length === 0}<p class="rounded-md border bg-white p-4 text-sm text-gray-600">No portal-published versions are retained yet. The next publication will start this history.</p>{:else}<ul class="divide-y rounded-lg border bg-white">{#each versionHistory as version}<li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="font-semibold">Version {version.configVersion}{version.configVersion === configVersion ? ' · Current' : ''}</p><p class="text-xs text-gray-500">{version.publishedAt ? new Date(version.publishedAt).toLocaleString() : 'Time unavailable'} · {version.publishedByLabel || (version.publishedBy ? 'Portal administrator' : 'Publisher unavailable')}</p></div><button type="button" class="crm-ui-button-secondary" disabled={version.configVersion === configVersion || submitState === 'loading'} on:click={() => useVersionAsRollbackDraft(version)}>Use as rollback draft</button></li>{/each}</ul>{#if versionHistoryTruncated}<p class="text-xs text-amber-800">Showing the 20 most recent retained versions.</p>{/if}{/if}</div>
      {/if}
    </div>
    <div class="crm-ui-studio-actions">
      <StatusButton
        type="button"
        state={submitState}
        on:click={requestPublishReview}
        disabled={!canPublish}
        idleText="Publish App"
        loadingText="Publishing..."
        successText="Saved!"
        errorText="Retry Publish"
        class="crm-ui-studio-publish"
      />
    </div>
    <p class="px-4 pb-3 text-right text-xs text-gray-500">
      {#if configLoadState !== 'ready'}Publishing waits for an authoritative configuration load.
      {:else if !configIsValid}Provide an app name, valid six-digit hex colors, non-empty tab names, and no more than five active tabs.
      {:else if !isDirty}No unpublished changes.
      {:else if !configVersionToken}Publishing waits for a backend version token.
      {:else}Ready to publish reviewed changes.{/if}
    </p>
  </div>

  <!-- Right Pane: Live Preview -->
  <div class="crm-ui-studio-preview">
    <!-- Abstract pattern background -->
    <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(var(--crm-brand-primary) 1px, transparent 1px); background-size: 20px 20px;"></div>

    <!-- Top Right: Logo Upload & Colors -->
    <div class="flex justify-end mb-6 z-20">
      <div class="crm-ui-studio-toolbar">
        <ImageFilePicker
          inputId="studio-logo-image"
          label="Logo"
          currentUrl={safeLogoPreviewUrl}
          previewAlt="Logo preview"
          bind:selectedFile={logoFile}
          bind:validationMessage={logoValidationMessage}
          disabled={true}
        />
        <p class="max-w-xs text-xs text-amber-800">Logo replacement is temporarily unavailable while private uploads are connected to family-app publication. Existing logos remain unchanged.</p>

        <div class="border-l border-gray-200 pl-6">
          <p class="crm-ui-label-caps">Brand Colors</p>
          <div class="flex flex-wrap gap-4">
            <!-- Primary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={primaryColor} on:focus={captureBrandingUndo} aria-label="Primary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {primaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Primary</div>
              </div>
              <input type="text" bind:value={primaryColor} aria-label="Primary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" />
            </div>
            <!-- Secondary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={secondaryColor} on:focus={captureBrandingUndo} aria-label="Secondary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {secondaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Secondary</div>
              </div>
              <input type="text" bind:value={secondaryColor} aria-label="Secondary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" />
            </div>
            <!-- Tertiary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={tertiaryColor} on:focus={captureBrandingUndo} aria-label="Tertiary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {tertiaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Tertiary</div>
              </div>
              <input type="text" bind:value={tertiaryColor} aria-label="Tertiary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" />
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2"><span class="text-xs font-semibold text-gray-600">Approved palettes:</span>{#each approvedPalettes as palette}<button type="button" class="rounded-md border bg-white px-2 py-1 text-xs" disabled={submitState === 'loading'} on:click={() => applyPalette(palette)}>{palette.name}</button>{/each}<button type="button" class="rounded-md border bg-white px-2 py-1 text-xs" disabled={!brandingUndoSnapshot || submitState === 'loading'} on:click={undoBrandingChange}>Undo branding change</button></div>
        </div>
      </div>
    </div>

    <div class="flex flex-1 flex-col items-center justify-start gap-3 py-4">
      <p class="z-10 text-xs font-medium text-gray-600">
        Live mobile preview · 375 × 812{previewDraftSyncState === 'synced' ? ' · Synced' : ''}
      </p>
      <!-- Mobile Device Frame -->
      <div class="crm-ui-studio-device">

        <!-- Notch -->
        <div class="crm-ui-studio-notch"></div>

      {#if $tenantIdStore && previewSrc}
        <iframe
          bind:this={previewFrame}
          src={previewSrc}
          title={`${appName.trim() || 'Program'} mobile app preview`}
          class="crm-ui-studio-app-frame"
          allow="clipboard-read; clipboard-write; fullscreen"
          on:load={handlePreviewLoad}
        ></iframe>
        {#if previewLoadState === 'loading'}
          <div class="crm-ui-studio-preview-loading" role="status">
            Loading the mobile app…
          </div>
        {/if}
      {:else if !previewBaseUrl}
        <div class="crm-ui-studio-empty-preview">
          The mobile preview is unavailable in this environment.
        </div>
      {:else}
        <div class="crm-ui-studio-empty-preview">
          Select an organization to preview.
        </div>
      {/if}
    </div>
    </div>
  </div>
</div>
