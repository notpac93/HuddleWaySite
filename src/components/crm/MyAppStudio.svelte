<script lang="ts">
  import { onDestroy } from 'svelte';
  import { tenantIdStore, tenantNamesStore } from '../../lib/authStore';
  import {
    publicEnvironment,
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
  } from '../../lib/ui/appConfigurationReview';
  import {
    clearPortalDraft,
    registerPortalDraft,
  } from '../../lib/ui/portalDraftGuard';
  import AppPublishReview from './app/AppPublishReview.svelte';
  import AppPreviewFrame from './app/AppPreviewFrame.svelte';
  import { resolveAppPreviewEnvironment } from '../../lib/crm/appPreviewProtocol';
  import { eventsStore, teamsStore } from '../../lib/services/DataStore';
  import BrandingPanel from './app-studio/BrandingPanel.svelte';
  import NavigationPanel from './app-studio/NavigationPanel.svelte';
  import VersionHistoryPanel from './app-studio/VersionHistoryPanel.svelte';
  import ComponentsStudio from './app-studio/ComponentsStudio.svelte';
  import BrandingControls from './app-studio/BrandingControls.svelte';
  import {
    createAppStudioController,
    type SavedAppStudioDraft,
  } from './app-studio/appStudioController';
  import {
    approvedPalettes,
    completeFiveTabSlots,
    configurationSignature,
    initialTabs,
    permanentTabName,
    validAppConfiguration,
    type AppVersion,
    type NavigationTabDraft,
  } from './app-studio/appConfigurationDraft';


  // Form Configurator State
  let primaryColor = '';
  let secondaryColor = '';
  let tertiaryColor = '';
  let appName = '';
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
  let publishMessage = '';
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
  let publishedAt: string | null = null;
  let publishedByLabel: string | null = null;
  let versionHistory: AppVersion[] = [];
  let versionHistoryState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let versionHistoryTruncated = false;
  let brandingUndoSnapshot: Pick<CrmAppConfiguration, 'name' | 'primaryColor' | 'secondaryColor' | 'tertiaryColor'> | null = null;
  let reviewChanges: string[] = [];
  let previewConfiguration: CrmAppConfiguration;

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
  $: {
    appName;
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
  $: {
    appName;
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

  // Active Tab in the left pane
  let activeTab = 'Branding';
  const tabs = ['Branding', 'Pages', 'Components', 'Version history'];

  $: if (String($tenantIdStore || '') !== activeTenantId) {
    activeTenantId = String($tenantIdStore || '');
    controller.selectTenant(activeTenantId);
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
    if (activeTenantId) {
      loadTenantConfig(activeTenantId);
    } else {
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
  }

  function removeLocalDraft() {
    if (activeTenantId) controller.removeDraft(activeTenantId);
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
    primaryColor = configuration.primaryColor;
    secondaryColor = configuration.secondaryColor;
    tertiaryColor = configuration.tertiaryColor;
    logoUrl = configuration.logoUrl;
    tabsConfig = configuration.navigationTabs.map((tab) => ({ ...tab }));
    savedDraft = null;
  }

  async function loadTenantConfig(tenantId) {
    configLoadState = 'loading';
    configLoadMessage = '';
    configVersionToken = '';
    const result = await controller.loadConfiguration(tenantId);
    if (result.status === 'stale' || $tenantIdStore !== tenantId) return;
    if (result.status === 'ready') {
      const snapshot = result.snapshot;

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
    const configuration = currentConfiguration();
    const submittedSignature = configurationSignature(configuration);
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
      submitState = 'success';
      publishMessage = 'App configuration published and reloaded from the server.';
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
  <div class="crm-ui-studio-editor">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-3 sm:px-6">
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-950">My App</h2>
          {#if configLoadState === 'ready'}
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold {isDirty ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}">{isDirty ? 'Draft changes' : 'Published'} · v{configVersion || 1}</span>
          {/if}
        </div>
        <p class="mt-1 truncate text-xs text-gray-500">Edit one area and see the family app update beside it{publishedAt ? ` · Last published ${new Date(publishedAt).toLocaleString()} by ${publishedByLabel || 'publisher unavailable'}` : ''}.</p>
      </div>
      {#if activeTab !== 'Components'}
        <div class="flex items-center gap-3">
          <span class="hidden max-w-64 text-right text-xs text-gray-500 md:block">
            {#if configLoadState !== 'ready'}Loading authoritative configuration…
            {:else if !configIsValid}Resolve the highlighted settings.
            {:else if !isDirty}No unpublished changes.
            {:else}Ready for review.{/if}
          </span>
          <StatusButton type="button" state={submitState} on:click={requestPublishReview} disabled={!canPublish} idleText="Publish App" loadingText="Publishing..." successText="Published" errorText="Retry Publish" class="crm-ui-studio-publish" />
        </div>
      {/if}
    </header>

    <nav aria-label="My App sections" class="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-4 sm:px-6">
      {#each tabs as tab}
        <button type="button" disabled={submitState === 'loading'} aria-pressed={activeTab === tab} class="whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors {activeTab !== tab ? 'border-transparent text-gray-500 hover:text-gray-800' : 'border-[var(--crm-brand-border)] text-[var(--crm-brand-link)]'}" on:click={() => activeTab = tab}>{tab}</button>
      {/each}
    </nav>

    {#if configLoadState === 'loading'}
      <p class="crm-ui-studio-loading" role="status">Loading authoritative app configuration…</p>
    {:else if configLoadState === 'error' || configLoadState === 'permission'}
      <div class="crm-ui-studio-error" role="alert"><p>{configLoadMessage}</p>{#if configLoadState === 'error' && activeTenantId}<button type="button" class="mt-2 font-semibold underline" on:click={() => loadTenantConfig(activeTenantId)}>Retry</button>{/if}</div>
    {:else if configLoadState === 'ready' && !configVersionToken}
      <p class="crm-ui-studio-warning" role="status">No concurrency token was returned. Publishing remains disabled.</p>
    {/if}

    {#if publishMessage}<div class="mx-5 mt-3 rounded-md border p-3 text-sm {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={submitState === 'error' ? 'alert' : 'status'}>{publishMessage}</div>{/if}
    {#if draftNotice}<div class="mx-5 mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">{draftNotice}</div>{/if}
    {#if savedDraft}
      <div class="mx-5 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
        <p>Browser draft saved {new Date(savedDraft.savedAt).toLocaleString()}. {savedDraft.versionToken === configVersionToken ? 'It is safe to restore.' : 'It is outdated and cannot be restored.'}</p>
        <div class="flex gap-2">{#if savedDraft.versionToken === configVersionToken}<button type="button" class="font-semibold underline" on:click={restoreLocalDraft}>Restore</button>{/if}<button type="button" class="font-semibold underline" on:click={removeLocalDraft}>Discard</button></div>
      </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-y-auto bg-gray-50 lg:overflow-hidden">
      {#if activeTab === 'Components'}
        <div class="h-full overflow-y-auto p-4 sm:p-5">
          <ComponentsStudio tenantId={String($tenantIdStore || '')} configuration={previewConfiguration} configurationReady={configLoadState === 'ready'} previewOrigin={previewBaseUrl} {previewEnvironment} expectedSourceCommit={publicEnvironment.PUBLIC_APP_PREVIEW_COMMIT || ''} expectedReleaseId={publicEnvironment.PUBLIC_APP_PREVIEW_RELEASE_ID || ''} />
        </div>
      {:else if activeTab === 'Version history'}
        <div class="mx-auto h-full max-w-4xl overflow-y-auto p-5 sm:p-6">
          <VersionHistoryPanel versions={versionHistory} state={versionHistoryState} currentVersion={configVersion} truncated={versionHistoryTruncated} disabled={submitState === 'loading'} onRetry={() => activeTenantId && loadVersionHistory(activeTenantId)} onUseVersion={useVersionAsRollbackDraft} />
        </div>
      {:else}
        <div class="grid min-h-full lg:h-full lg:grid-cols-[minmax(20rem,0.8fr)_minmax(28rem,1.2fr)]">
          <aside aria-label={`${activeTab} settings`} class="min-w-0 overflow-y-auto border-r border-gray-200 bg-white p-5 sm:p-6">
            {#if activeTab === 'Branding'}
              <div class="space-y-6">
                <div><h3 class="text-base font-semibold text-gray-950">Brand identity</h3><p class="mt-1 text-sm text-gray-600">Keep the essentials together. The preview updates as you type.</p></div>
                <BrandingPanel bind:appName disabled={submitState === 'loading'} onCaptureUndo={captureBrandingUndo} />
                <BrandingControls bind:primaryColor bind:secondaryColor bind:tertiaryColor bind:logoFile bind:logoValidationMessage {safeLogoPreviewUrl} disabled={submitState === 'loading'} canUndo={Boolean(brandingUndoSnapshot)} onCaptureUndo={captureBrandingUndo} onApplyPalette={applyPalette} onUndo={undoBrandingChange} />
              </div>
            {:else}
              <NavigationPanel bind:tabsConfig disabled={submitState === 'loading'} duplicateLabels={hasDuplicateTabLabels(currentConfiguration())} {activeContentCount} onMove={moveTab} />
            {/if}
          </aside>
          <section aria-label="Live family app preview" class="crm-ui-studio-preview">
            <div class="pointer-events-none absolute inset-0 opacity-5" style="background-image: radial-gradient(var(--crm-brand-primary) 1px, transparent 1px); background-size: 20px 20px;"></div>
            <AppPreviewFrame compact previewOrigin={previewBaseUrl} tenantId={String($tenantIdStore || '')} environment={previewEnvironment} configuration={previewConfiguration} configurationReady={configLoadState === 'ready'} title={`${appName.trim() || 'Program'} mobile app preview`} expectedSourceCommit={publicEnvironment.PUBLIC_APP_PREVIEW_COMMIT || ''} expectedReleaseId={publicEnvironment.PUBLIC_APP_PREVIEW_RELEASE_ID || ''} />
          </section>
        </div>
      {/if}
    </div>
  </div>
</div>
