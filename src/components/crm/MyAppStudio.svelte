<script lang="ts">
  import { toast } from './ui/toast';
  import { getContext, onDestroy } from 'svelte';
  import { readable } from 'svelte/store';
  import { MY_APP_NAVIGATION, type MyAppNavigation } from '../../lib/crm/myAppNavigation';
  const navigation = getContext<MyAppNavigation | undefined>(MY_APP_NAVIGATION);
  const desktopDashboard = navigation?.desktopDashboard ?? readable(false);
  import Icon from './ui/Icon.svelte';

  export let active = true;
  export let suspendInactivePreviews = false;
  export let allowNavigationEditing = true;
  let showTools = false;
  let toolsMounted = false;
  let componentsMounted = false;
  let canvasEditing = false;
  let canvasEditor: ComponentsStudio | null = null;
  let editSessionId = '';
  function editOnCanvas() { navigation?.dismiss(); showTools = false; componentsMounted = true; editSessionId = createIdempotencyKey('canvas'); canvasEditing = true; }
  function openTools() {
    if ($desktopDashboard) {
      selectStudioSection('Branding');
      return;
    }
    navigation?.dismiss();
    if (activeTab === 'Components') activeTab = 'Branding';
    toolsMounted = true;
    showTools = true;
  }
  function selectStudioSection(section: string) {
    if (section === 'Components') {
      if ($desktopDashboard) activeTab = section;
      if (!canvasEditing || showTools) editOnCanvas();
      return;
    }
    activeTab = section;
    if ($desktopDashboard) canvasEditing = false;
  }

  let desktopStarted = false;
  function syncDesktopLayout(desktop: boolean, visible: boolean) {
    if (!desktop || !visible) return;
    showTools = false;
    if (!desktopStarted) {
      desktopStarted = true;
      activeTab = 'Components';
    }
    if (activeTab === 'Components' && !canvasEditing) editOnCanvas();
  }
  $: syncDesktopLayout($desktopDashboard, active);
  $: if (!active) { showTools = false; canvasEditing = false; }
  import { tenantIdStore, tenantNamesStore } from '../../lib/authStore';
  import {
    publicEnvironment,
    resolveBackendUrl,
    resolveCrmAppPreviewUrl,
  } from '../../lib/config/publicEnvironment';
  import {
    createIdempotencyKey,
    type CrmAppConfiguration,
  } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import { validateImageFile } from '../../lib/media/imageUpload';
  import {
    describeAppConfigurationChanges,
    hasDuplicateTabLabels,
    isRetiredNavigationTab,
  } from '../../lib/ui/appConfigurationReview';
  import {
    clearPortalDraft,
    registerPortalDraft,
  } from '../../lib/ui/portalDraftGuard';
  import AppPublishReview from './app/AppPublishReview.svelte';
  import AppPreviewFrame from './app/AppPreviewFrame.svelte';
  import { resolveAppPreviewEnvironment } from '../../lib/crm/appPreviewProtocol';
  import type { AppPagePreviewDraft, CanvasAction } from '../../lib/crm/appPreviewProtocol';
  import BrandingPanel from './app-studio/BrandingPanel.svelte';
  import NavigationPanel from './app-studio/NavigationPanel.svelte';
  import VersionHistoryPanel from './app-studio/VersionHistoryPanel.svelte';
  import ComponentsStudio from './app-studio/ComponentsStudio.svelte';
  import AppStudioTools from './app-studio/AppStudioTools.svelte';
  import GlassAppearanceControls from './app-studio/GlassAppearanceControls.svelte';
  import { normalizeGlassAppearance } from '../../lib/ui/glassAppearance';
  import BrandingControls from './app-studio/BrandingControls.svelte';
  import {
    createAppStudioController,
    type SavedAppStudioDraft,
  } from './app-studio/appStudioController';
  import {
    completeFiveTabSlots,
    configurationSignature,
    initialTabs,
    portalNavigationTabs,
    useSingleTeamsTab,
    validAppConfiguration,
    verifyPublishedNavigation,
    visibleNavigationSignature,
    type AppVersion,
    type NavigationTabDraft,
  } from './app-studio/appConfigurationDraft';


  // Form Configurator State
  let primaryColor = '';
  let secondaryColor = '';
  let tertiaryColor = '';
  let appName = '';
  let glassAppearance = normalizeGlassAppearance();
  let appStyle: 'light' | 'dark' | 'system' = 'system';
  let tabsConfig: NavigationTabDraft[] = [];
  let suggestedTabKeys = new Set<string>();
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
  let retainedConfigSignature = '';
  let publishMessage = '';
  let publicationPending = false;
  let draftNotice = '';
  let publishRequestId = '';
  let publishIdempotencyKey = createIdempotencyKey('app-configuration-publish');
  let publishAttemptSignature = '';
  let currentConfigSignature = '';
  let currentAttemptSignature = '';
  let configIsValid = false;
  let activeTenantId = '';
  let showPublishReview = false;
  let savedDraft: SavedAppStudioDraft | null = null;
  let configVersion = 0;
  let versionHistory: AppVersion[] = [];
  let versionHistoryState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let versionHistoryTruncated = false;
  let brandingUndoSnapshot: Pick<CrmAppConfiguration, 'name' | 'appStyle' | 'glassAppearance' | 'primaryColor' | 'secondaryColor' | 'tertiaryColor'> | null = null;
  let reviewChanges: string[] = [];
  let previewConfiguration: CrmAppConfiguration;
  let pageDraft: AppPagePreviewDraft | null = null;
  let layoutPreviewSynced = false;
  function setPageDraft(draft: AppPagePreviewDraft | null) { pageDraft = draft; }
  function setPreviewSynced(synced: boolean) { layoutPreviewSynced = synced; }
  function onCanvasAction(action: CanvasAction) { canvasEditor?.handleCanvasAction(action); }

  const previewBaseUrl = resolveCrmAppPreviewUrl(publicEnvironment);
  const previewEnvironment = resolveAppPreviewEnvironment(publicEnvironment);
  const controller = createAppStudioController();

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  function buildConfigSignature() {
    return configurationSignature(currentConfiguration());
  }

  function currentConfiguration(): CrmAppConfiguration {
    return {
      name: appName.trim(),
      appStyle,
      glassAppearance,
      primaryColor,
      secondaryColor,
      tertiaryColor,
      logoUrl,
      // Suggested controls are not configuration changes until explicitly used.
      navigationTabs: tabsConfig.filter((tab) =>
        !suggestedTabKeys.has(tab.key) || tab.enabled
        || tab.label.trim() !== initialTabs.find((item) => item.key === tab.key)?.label,
      ).map((tab) => ({ ...tab, label: tab.label.trim() })),
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
    appStyle;
    glassAppearance;
    primaryColor;
    secondaryColor;
    tertiaryColor;
    tabsConfig;
    suggestedTabKeys;
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
  $: {
    currentConfigSignature;
    appName;
    appStyle;
    glassAppearance;
    primaryColor;
    secondaryColor;
    tertiaryColor;
    tabsConfig;
    configIsValid = validAppConfiguration(currentConfiguration())
      && !hasDuplicateTabLabels(currentConfiguration());
  }
  $: {
    // Svelte cannot infer the form dependencies hidden inside
    // currentConfiguration(). Key this review projection to the explicit
    // signature so nested tab-label edits are always included.
    currentConfigSignature;
    logoFile;
    reviewChanges = describeAppConfigurationChanges(
      configMode === 'initialize' ? null : loadedConfiguration,
      currentConfiguration(),
    );
    if (publicationPending) reviewChanges = [...reviewChanges, 'Retry consumer publication of the saved configuration.'];
    if (logoFile) reviewChanges = [...reviewChanges, 'Logo replaced'];
  }
  $: selectedOrganizationName = $tenantNamesStore[activeTenantId]
    || activeTenantId
    || 'the selected organization';
  $: navigationDirty = Boolean(loadedConfiguration) &&
    visibleNavigationSignature(tabsConfig) !== visibleNavigationSignature(loadedConfiguration?.navigationTabs ?? []);
  $: previewRequired = allowNavigationEditing && Boolean(previewBaseUrl)
    && previewEnvironment !== 'dev' && (activeTab === 'Pages' || navigationDirty);
  $: canReview =
    configLoadState === 'ready'
    && Boolean(configVersionToken)
    && configIsValid
    && (isDirty || publicationPending)
    && submitState !== 'loading';
  $: reviewBlocker = previewRequired && !layoutPreviewSynced
    ? 'Wait for the app preview to catch up before publishing.' : '';
  $: canPublish = canReview && !reviewBlocker;
  $: reviewTabOrder = navigationDirty
    ? tabsConfig.filter((tab) => tab.enabled && !isRetiredNavigationTab(tab)).map((tab) => tab.label.trim()) : [];
  $: currentAttemptSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    configuration: currentConfigSignature,
    logoFile: logoFile
      ? { name: logoFile.name, type: logoFile.type, size: logoFile.size }
      : null,
    configMode,
    configVersionToken,
  });
  $: {
    currentConfigSignature;
    appName;
    appStyle;
    glassAppearance;
    primaryColor;
    secondaryColor;
    tertiaryColor;
    tabsConfig;
    logoUrl;
    logoPreviewDataUrl;
    previewConfiguration = {
      ...currentConfiguration(),
      logoUrl: logoPreviewDataUrl || logoUrl,
    };
  }
  $: logoFile, refreshLogoPreview(logoFile);
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

  let activeTab = 'Branding';
  $: tabs = ['Branding', ...(allowNavigationEditing ? ['Pages'] : []), 'Components', 'Version history'];
  $: if (!allowNavigationEditing && activeTab === 'Pages') activeTab = 'Branding';
  $: settingsOpen = $desktopDashboard ? active && activeTab !== 'Components' : showTools;
  $: editingComponents = $desktopDashboard ? active && activeTab === 'Components' : canvasEditing && !showTools;

  $: if (String($tenantIdStore || '') !== activeTenantId) {
    activeTenantId = String($tenantIdStore || '');
    canvasEditing = false;
    controller.selectTenant(activeTenantId);
    primaryColor = '';
    secondaryColor = '';
    tertiaryColor = '';
    appName = '';
    appStyle = 'system';
    glassAppearance = normalizeGlassAppearance();
    publicationPending = false;
    tabsConfig = [];
    suggestedTabKeys = new Set();
    logoUrl = null;
    logoFile = null;
    logoPreviewDataUrl = null;
    logoValidationMessage = '';
    loadedConfigSignature = '';
    configVersionToken = '';
    configVersion = 0;
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
    if (activeTenantId) {
      loadTenantConfig(activeTenantId);
    } else {
      configLoadState = 'idle';
      configLoadMessage = '';
    }
  }

  $: if (active && isDirty && activeTenantId
    && (currentConfigSignature !== retainedConfigSignature || Boolean(logoFile))) {
    registerPortalDraft({
      id: 'my-app-configuration',
      title: 'Save your changes?',
      message: 'Save a draft to continue later.',
      retainLabel: 'Save draft & leave',
      onDiscard: discardLocalChanges,
      onRetain: retainLocalDraft,
    });
  } else {
    clearPortalDraft('my-app-configuration');
  }

  onDestroy(() => clearPortalDraft('my-app-configuration'));

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

  function retainLocalDraft() {
    if (!activeTenantId) return;
    const draft = {
      versionToken: configVersionToken,
      savedAt: new Date().toISOString(),
      configuration: currentConfiguration(),
    };
    controller.saveDraft(activeTenantId, draft);
    savedDraft = draft;
    retainedConfigSignature = buildConfigSignature();
  }

  function removeLocalDraft() {
    if (activeTenantId) controller.removeDraft(activeTenantId);
    savedDraft = null;
  }

  function discardLocalChanges() {
    if (loadedConfiguration) {
      appName = loadedConfiguration.name;
      appStyle = loadedConfiguration.appStyle || 'system';
      glassAppearance = normalizeGlassAppearance(loadedConfiguration.glassAppearance);
      primaryColor = loadedConfiguration.primaryColor;
      secondaryColor = loadedConfiguration.secondaryColor;
      tertiaryColor = loadedConfiguration.tertiaryColor;
      logoUrl = loadedConfiguration.logoUrl;
      tabsConfig = allowNavigationEditing
        ? completeFiveTabSlots(loadedConfiguration.navigationTabs)
        : loadedConfiguration.navigationTabs.map((tab) => ({ ...tab }));
    }
    logoFile = null;
    removeLocalDraft();
  }

  function captureBrandingUndo() {
    brandingUndoSnapshot = { name: appName, appStyle, glassAppearance, primaryColor, secondaryColor, tertiaryColor };
  }

  function undoBrandingChange() {
    if (!brandingUndoSnapshot) return;
    const prior = brandingUndoSnapshot;
    brandingUndoSnapshot = { name: appName, appStyle, glassAppearance, primaryColor, secondaryColor, tertiaryColor };
    appName = prior.name;
    appStyle = prior.appStyle || 'system';
    glassAppearance = normalizeGlassAppearance(prior.glassAppearance);
    primaryColor = prior.primaryColor;
    secondaryColor = prior.secondaryColor;
    tertiaryColor = prior.tertiaryColor;
  }

  function editableNavigation(tabs: NavigationTabDraft[]) {
    return allowNavigationEditing
      ? useSingleTeamsTab(portalNavigationTabs(activeTenantId, tabs))
      : tabs.map((tab) => ({ ...tab }));
  }

  function useVersionAsRollbackDraft(version: AppVersion) {
    captureBrandingUndo();
    const configuration = version.configuration;
    appName = configuration.name;
    appStyle = configuration.appStyle || 'system';
    glassAppearance = normalizeGlassAppearance(configuration.glassAppearance);
    primaryColor = configuration.primaryColor;
    secondaryColor = configuration.secondaryColor;
    tertiaryColor = configuration.tertiaryColor;
    logoUrl = configuration.logoUrl;
    if (allowNavigationEditing) tabsConfig = editableNavigation(configuration.navigationTabs);
    selectStudioSection('Branding');
    draftNotice = `Version ${version.configVersion} is loaded as an unpublished rollback draft. Review the preview and publish to make it current.`;
  }

  async function loadVersionHistory(tenantId: string) {
    versionHistoryState = 'loading';
    const result = await controller.loadHistory(tenantId);
    if (result.status === 'ready') {
      versionHistory = result.versions;
      versionHistoryTruncated = result.truncated;
      versionHistoryState = 'ready';
    } else if (result.status === 'error') {
      versionHistoryState = 'error';
    }
  }

  function restoreLocalDraft() {
    if (!savedDraft || savedDraft.versionToken !== configVersionToken) return;
    const configuration = savedDraft.configuration;
    appName = configuration.name;
    appStyle = configuration.appStyle || 'system';
    glassAppearance = normalizeGlassAppearance(configuration.glassAppearance);
    primaryColor = configuration.primaryColor;
    secondaryColor = configuration.secondaryColor;
    tertiaryColor = configuration.tertiaryColor;
    logoUrl = configuration.logoUrl;
    if (allowNavigationEditing) tabsConfig = editableNavigation(configuration.navigationTabs);
    savedDraft = null;
  }

  async function loadTenantConfig(tenantId) {
    configLoadState = 'loading';
    suggestedTabKeys = new Set();
    retainedConfigSignature = '';
    configLoadMessage = '';
    configVersionToken = '';
    const result = await controller.loadConfiguration(tenantId);
    if (result.status === 'stale' || $tenantIdStore !== tenantId) return;
    if (result.status === 'ready') {
      const snapshot = result.snapshot;

      configMode = snapshot.mode;
      configVersion = snapshot.configVersion;
      configVersionToken = snapshot.versionToken;
      if (snapshot.configuration) {
        const configuration = snapshot.configuration;
        primaryColor = configuration.primaryColor;
        secondaryColor = configuration.secondaryColor;
        tertiaryColor = configuration.tertiaryColor;
        appName = configuration.name;
        appStyle = configuration.appStyle || 'system';
        glassAppearance = normalizeGlassAppearance(configuration.glassAppearance);
        logoUrl = configuration.logoUrl;
        tabsConfig = allowNavigationEditing
          ? portalNavigationTabs(tenantId, configuration.navigationTabs)
          : editableNavigation(configuration.navigationTabs);
        loadedConfigSignature = buildConfigSignature();
        loadedConfiguration = currentConfiguration();
        if (allowNavigationEditing) {
          tabsConfig = useSingleTeamsTab(tabsConfig);
          const configuredKeys = new Set(tabsConfig.map((tab) => tab.key));
          tabsConfig = completeFiveTabSlots(tabsConfig);
          suggestedTabKeys = new Set(tabsConfig.filter((tab) => !configuredKeys.has(tab.key)).map((tab) => tab.key));
        }
      } else {
        primaryColor = '';
        secondaryColor = '';
        tertiaryColor = '';
        appName = '';
        appStyle = 'system';
        glassAppearance = normalizeGlassAppearance();
        logoUrl = null;
        // Defaults are offered only after the backend confirms initialize mode.
        tabsConfig = editableNavigation(initialTabs);
        loadedConfigSignature = buildConfigSignature();
        loadedConfiguration = currentConfiguration();
      }
      configLoadState = 'ready';
      savedDraft = controller.readDraft(tenantId);
      void loadVersionHistory(tenantId);
    } else {
      console.error('App configuration load failed.');
      configLoadState = result.loadState;
      configLoadMessage = result.message;
      publishRequestId = result.requestId;
    }
  }

  async function handlePublish() {
    if (!canPublish || submitState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId || tenantId !== activeTenantId) return;

    logoValidationMessage = validateImageFile(logoFile);
    if (logoValidationMessage) {
      return;
    }
    const expectedVersionToken = configVersionToken;
    const mode = configMode;
    submitState = 'loading';
    publishMessage = '';
    draftNotice = '';
    publishRequestId = '';
    let publishedLogoUrl = logoUrl;
    if (logoFile) {
      const logoResult = await controller.publishLogo({
        tenantId,
        file: logoFile,
        uploadIdempotencyKey: `${publishIdempotencyKey}:logo-upload`,
        publicationIdempotencyKey: `${publishIdempotencyKey}:logo-publish`,
      });
      if (logoResult.status === 'stale') return;
      if (logoResult.status === 'error') {
        publishRequestId = logoResult.requestId;
        publishMessage = 'The logo could not be uploaded. Check the image and try again.';
        submitState = 'error';
        return;
      }
      publishedLogoUrl = logoResult.publicUrl;
    }
    const configuration = {
      ...currentConfiguration(),
      logoUrl: publishedLogoUrl,
    };
    const submittedSignature = configurationSignature(configuration);
    const checkNavigation = allowNavigationEditing && previewEnvironment !== 'dev'
      && (publicationPending || visibleNavigationSignature(configuration.navigationTabs)
        !== visibleNavigationSignature(loadedConfiguration?.navigationTabs ?? []));
    const result = await controller.publish({
      tenantId,
      configuration,
      mode,
      expectedVersionToken,
      idempotencyKey: publishIdempotencyKey,
    });
    if (result.status === 'stale') return;
    publishRequestId = 'requestId' in result ? result.requestId : '';
    if (result.status === 'published') {
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
      const navigationVerified = !checkNavigation || await verifyPublishedNavigation(
        resolveBackendUrl(publicEnvironment), tenantId, configuration.navigationTabs,
      );
      if ($tenantIdStore !== tenantId) return;
      publicationPending = result.publicationPending === true || !navigationVerified;
      submitState = publicationPending ? 'error' : 'success';
      publishMessage = publicationPending
        ? 'Configuration saved. The family app update is still pending. Publish again to retry.'
        : checkNavigation
          ? 'Published. The family app tab order was verified.'
          : 'App configuration published and reloaded from the server.';
      removeLocalDraft();
    } else {
      console.error('App configuration publish failed.');
      if (result.status === 'conflict') {
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
    if (!canReview || activeTenantId !== $tenantIdStore) return;
    showPublishReview = true;
  }

  function confirmPublish() {
    if (!canPublish) return;
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
    changes={reviewChanges}
    tabOrder={reviewTabOrder}
    blockedReason={reviewBlocker}
    onCancel={() => showPublishReview = false}
    onConfirm={confirmPublish}
  />
{/if}

{#snippet studioSections()}
  <nav aria-label="My App sections" class="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-4 sm:px-6">
      {#each tabs as tab}
        <button type="button" disabled={submitState === 'loading'} aria-pressed={activeTab === tab} class="whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors {activeTab !== tab ? 'border-transparent text-gray-500 hover:text-gray-800' : 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]'}" on:click={() => selectStudioSection(tab)}>{tab}</button>
      {/each}
    </nav>
{/snippet}

<div class="studio-workspace" class:desktop-studio={$desktopDashboard}>
  {#if $desktopDashboard}
    <header class="studio-desktop-header">
      {@render studioSections()}
    </header>
  {/if}
<div class="my-app-canvas" class:section-editing={editingComponents} class:tools-open={showTools} aria-label="My App canvas">
  <div class="studio-preview" aria-label="Consumer app preview">
  {#if $desktopDashboard}<h3>{activeTab === 'Pages' && isDirty ? 'Draft app preview' : 'Consumer app preview'}</h3>{/if}
  {#if !suspendInactivePreviews || active}
  <AppPreviewFrame immersive {pageDraft} {onCanvasAction} onSyncedChange={setPreviewSynced} onInteract={() => navigation?.dismiss()} previewOrigin={previewBaseUrl} tenantId={String($tenantIdStore || '')} environment={previewEnvironment} configuration={previewConfiguration} configurationReady={configLoadState === 'ready'} title={`${appName.trim() || 'Program'} mobile app preview`} expectedSourceCommit={publicEnvironment.PUBLIC_APP_PREVIEW_COMMIT || ''} expectedReleaseId={publicEnvironment.PUBLIC_APP_PREVIEW_RELEASE_ID || ''} />
  {/if}
  {#if configLoadState === 'error' || configLoadState === 'permission'}
    <div class="canvas-error" role="alert"><p>{configLoadMessage}</p>{#if configLoadState === 'error'}<button type="button" on:click={() => loadTenantConfig(activeTenantId)}>Retry</button>{/if}</div>
  {/if}
  </div>
  {#if componentsMounted}<div class="canvas-edit-tools" hidden={!editingComponents}>
    <ComponentsStudio bind:this={canvasEditor} canvasOnly externalCanvas {editSessionId} canvasEditing={editingComponents} previewSynced={layoutPreviewSynced} active={active} previewActive={false} organizationName={selectedOrganizationName} onSettings={openTools} onDone={() => $desktopDashboard ? selectStudioSection('Branding') : canvasEditing = false} onPageDraftChange={setPageDraft} tenantId={String($tenantIdStore || '')} configuration={previewConfiguration} configurationReady={configLoadState === 'ready'} previewOrigin={previewBaseUrl} {previewEnvironment} expectedSourceCommit={publicEnvironment.PUBLIC_APP_PREVIEW_COMMIT || ''} expectedReleaseId={publicEnvironment.PUBLIC_APP_PREVIEW_RELEASE_ID || ''} />
  </div>{/if}
  {#if active && !$desktopDashboard && !showTools && !canvasEditing}<div class="canvas-tools"><button type="button" aria-label="Edit" on:click={editOnCanvas}><Icon name="myApp" size={18} />Edit{#if isDirty}<span class="draft-dot" aria-label="Unpublished changes"></span>{/if}</button></div>{/if}
</div>
{#if toolsMounted || $desktopDashboard}
<AppStudioTools open={settingsOpen} embedded={$desktopDashboard} focusEnabled={!showPublishReview}>
<div class="crm-ui-studio-root">
  <div class="crm-ui-studio-editor">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 sm:px-6">
      <div class="min-w-0">
        <h2 class="text-xl font-semibold text-gray-950">{$desktopDashboard ? activeTab : 'Edit app'}</h2>
      </div>
      {#if !$desktopDashboard}<button type="button" class="app-tools-done" on:click={() => showTools = false}>Back to app</button>{/if}
        <div class="flex items-center gap-3">
          <span class="hidden max-w-64 text-right text-xs text-gray-500 md:block">
            {#if configLoadState !== 'ready'}Loading authoritative configuration…
            {:else if !configIsValid}Resolve the highlighted settings.
            {:else if !isDirty}No unpublished changes.
            {:else if previewRequired && !layoutPreviewSynced}Updating preview…
            {:else}Ready for review.{/if}
          </span>
          <StatusButton type="button" state={submitState} on:click={requestPublishReview} disabled={!canReview} idleText="Review changes" loadingText="Publishing…" successText="Published" errorText="Review changes" class="crm-ui-studio-publish" />
        </div>
    </header>

    {#if !$desktopDashboard}{@render studioSections()}{/if}

    {#if configLoadState === 'loading'}
      <p class="crm-ui-studio-loading" role="status">Loading authoritative app configuration…</p>
    {:else if configLoadState === 'error' || configLoadState === 'permission'}
      <div class="crm-ui-studio-error" role="alert"><p>{configLoadMessage}</p>{#if configLoadState === 'error' && activeTenantId}<button type="button" class="mt-2 font-semibold underline" on:click={() => loadTenantConfig(activeTenantId)}>Retry</button>{/if}</div>
    {:else if configLoadState === 'ready' && !configVersionToken}
      <p class="crm-ui-studio-warning" role="status">No concurrency token was returned. Publishing remains disabled.</p>
    {/if}

    {#if publishMessage}<div use:toast={{dismiss: () => publishMessage = ''}} class="mx-5 mt-3 rounded-md border p-3 text-sm {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={submitState === 'error' ? 'alert' : 'status'}>{publishMessage}</div>{/if}
    {#if draftNotice}<div use:toast={{dismiss: () => draftNotice = ''}} class="mx-5 mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{draftNotice}</div>{/if}
    {#if savedDraft}
      <div class="mx-5 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
        <p>Browser draft saved {new Date(savedDraft.savedAt).toLocaleString()}. {savedDraft.versionToken === configVersionToken ? 'It is safe to restore.' : 'It is outdated and cannot be restored.'}</p>
        <div class="flex gap-2">{#if savedDraft.versionToken === configVersionToken}<button type="button" class="font-semibold underline" on:click={restoreLocalDraft}>Restore</button>{/if}<button type="button" class="font-semibold underline" on:click={removeLocalDraft}>Discard</button></div>
      </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto bg-gray-50 lg:overflow-hidden">
      {#if activeTab === 'Version history'}
        <div class="mx-auto h-full max-w-4xl overflow-y-auto p-5 sm:p-6">
          <VersionHistoryPanel versions={versionHistory} state={versionHistoryState} currentVersion={configVersion} truncated={versionHistoryTruncated} disabled={submitState === 'loading'} onRetry={() => activeTenantId && loadVersionHistory(activeTenantId)} onUseVersion={useVersionAsRollbackDraft} />
        </div>
      {:else if activeTab !== 'Components'}
        <div class="min-h-full lg:h-full">
          <aside aria-label={`${activeTab} settings`} class="min-w-0 overflow-y-auto border-r border-gray-200 bg-white p-5 sm:p-6 lg:h-full">
            {#if activeTab === 'Branding'}
              <div class="space-y-6">
                <div><h3 class="text-base font-semibold text-gray-950">Brand identity</h3><p class="mt-1 text-sm text-gray-600">Keep the essentials together. The preview updates as you type.</p></div>
                <div class="rounded-xl border border-gray-200 p-4">
                  <label for="app-appearance" class="block font-semibold">App appearance</label>
                  <p class="text-sm text-gray-600">Choose Light, Dark, or follow each user's device with System. Publish to apply this to your program's app.</p>
                  <select id="app-appearance" bind:value={appStyle} disabled={submitState === 'loading'} on:change={captureBrandingUndo} class="mt-2 rounded border p-2">
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <GlassAppearanceControls bind:value={glassAppearance} accent={tertiaryColor} disabled={submitState === 'loading'} onCaptureUndo={captureBrandingUndo} />
                <BrandingPanel bind:appName disabled={submitState === 'loading'} onCaptureUndo={captureBrandingUndo} />
                <BrandingControls bind:primaryColor bind:secondaryColor bind:tertiaryColor bind:logoFile bind:logoValidationMessage {safeLogoPreviewUrl} disabled={submitState === 'loading'} canUndo={Boolean(brandingUndoSnapshot)} onCaptureUndo={captureBrandingUndo} onUndo={undoBrandingChange} />
              </div>
            {:else if allowNavigationEditing && active && settingsOpen && configLoadState === 'ready'}
              {#key activeTenantId}
                <NavigationPanel tenantId={activeTenantId} bind:tabsConfig disabled={submitState === 'loading'} duplicateLabels={hasDuplicateTabLabels(currentConfiguration())} />
              {/key}
            {/if}
          </aside>

        </div>
      {/if}
    </div>
  </div>
</div>

</AppStudioTools>{/if}
</div>
<style>
  .studio-workspace { display: flex; flex: 1; min-width: 0; min-height: 0; }
  .studio-preview { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .desktop-studio { display: grid; grid-template: "header header" auto "editor preview" minmax(0, 1fr) / minmax(0, 1fr) minmax(260px, min(38%, 420px)); gap: 14px; padding: 16px; min-height: 540px; }
  .studio-desktop-header { grid-area: header; display: flex; flex-wrap: wrap; align-items: center; gap: 0 12px; min-width: 0; border: 1px solid #dce2eb; border-radius: 12px; background: white; }
  .studio-desktop-header nav { flex: 1; min-width: 0; border: 0; }
  .desktop-studio .my-app-canvas { display: contents; }
  .desktop-studio .studio-preview { position: relative; grid-area: preview; border: 1px solid #dce2eb; border-radius: 12px; background: white; overflow: hidden; }
  .desktop-studio .studio-preview h3 { padding: 9px 12px; border-bottom: 1px solid #dce2eb; font-size: .8125rem; font-weight: 600; color: #435266; }
  .desktop-studio .my-app-canvas .canvas-edit-tools { position: relative; grid-area: editor; inset: auto; width: auto; min-width: 0; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
  .desktop-studio .canvas-edit-tools :global(.toolbar-row) { flex-wrap: wrap; }
  .desktop-studio .canvas-edit-tools[hidden] { display: none; }
  .desktop-studio .canvas-error { inset: 48px 10px auto; }
  @media (max-width: 1000px) {
    .desktop-studio { grid-template-columns: minmax(0, 1fr) minmax(220px, 35%); gap: 9px; padding: 10px; }
  }

  .my-app-canvas { position: relative; display: flex; flex: 1; min-height: 0; width: min(100%, 480px); max-width: 480px; height: 100%; padding-top: max(80px, calc(env(safe-area-inset-top) + 80px)); margin: 0 auto; overflow: hidden; background: #fafafa; }
  .canvas-tools { position: absolute; bottom: max(100px, calc(env(safe-area-inset-bottom) + 92px)); left: 50%; transform: translateX(-50%); z-index: 10; padding: 4px; background: white; border: 1px solid #dce2eb; border-radius: 18px; box-shadow: 0 5px 20px #0002; }
  .canvas-edit-tools { position: absolute; top: max(4px, env(safe-area-inset-top)); left: 4px; right: 4px; z-index: 20; }
  .my-app-canvas.section-editing { width: min(100%, 1100px); max-width: 1100px; padding-left: min(440px, 46%); padding-top: 0; }
  .section-editing :global(.immersive) { max-width: 480px; margin: 0 auto; }
  .section-editing .canvas-edit-tools { right: auto; width: min(430px, 44%); bottom: 8px; display: flex; flex-direction: column; min-height: 0; }
  .section-editing .canvas-edit-tools[hidden] { display: none; }
  .canvas-tools button { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; white-space: nowrap; border-radius: 13px; background: var(--crm-brand-control); color: var(--crm-on-primary); font-size: 14px; font-weight: 600; }
  .draft-dot { width: 7px; height: 7px; background: currentColor; border-radius: 50%; }
  .canvas-error { position: absolute; inset: 80px 20px auto; z-index: 12; padding: 20px; border-radius: 14px; background: white; color: #991b1b; }
  .canvas-error button { margin-top: 12px; text-decoration: underline; }
  .my-app-canvas.tools-open { flex: none; width: min(480px, calc(100% - min(440px, 45vw))); margin-right: min(440px, 45vw); }
  .app-tools-done { min-height: 44px; padding: 8px 12px; border-radius: 12px; font-size: 14px; font-weight: 600; background: var(--crm-brand-surface); color: var(--crm-brand-link); }
  @media(max-width: 767px) {
    .my-app-canvas.section-editing { padding-left: 0; padding-top: 0; padding-bottom: 0; }
    .section-editing .canvas-edit-tools { top: calc(max(12px, env(safe-area-inset-top)) + 50px); bottom: 0; left: 0; right: 0; width: auto; pointer-events: none; }
    .section-editing .canvas-edit-tools :global(.canvas-toolbar), .section-editing .canvas-edit-tools :global(.section-edit-page) { pointer-events: auto; }
    .my-app-canvas.tools-open { width: min(100%, 480px); margin: 0 auto; }
  }
</style>
