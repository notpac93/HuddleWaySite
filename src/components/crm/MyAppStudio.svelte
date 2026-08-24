<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
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
  let configMode: 'initialize' | 'update' = 'initialize';
  let configLoadState: 'idle' | 'loading' | 'ready' | 'error' | 'permission' = 'idle';
  let configLoadMessage = '';
  let loadedConfigSignature = '';
  let configLoadSequence = 0;
  let publishMessage = '';
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

  const previewBaseUrl = resolveCrmAppPreviewUrl(publicEnvironment);

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  const initialTabs = [
    { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
    { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'Team', enabled: true },
    { key: 'events', pageId: 'events_page', route: '/events', label: 'Events', enabled: true },
    { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
    { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
  ];
  const maxActiveTabs = 5;
  const missingTabPriority = ['events', 'home', 'messaging', 'schedule', 'teams'];
  const permanentTabNames: Record<string, string> = {
    home: 'Home',
    teams: 'Team',
    esports: 'Esports',
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
    return tab.key
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'App tab';
  }

  function completeFiveTabSlots(tabs: NavigationTabDraft[]) {
    const completed = tabs.map((tab) => ({ ...tab }));
    for (const key of missingTabPriority) {
      if (completed.length >= maxActiveTabs) break;
      const candidate = initialTabs.find((tab) => tab.key === key);
      if (
        candidate
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
  const tabs = ['Branding', 'Pages'];

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
    publishAttemptSignature = '';
    publishIdempotencyKey =
      createIdempotencyKey('app-configuration-publish');
    publishMessage = '';
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
      }
      configLoadState = 'ready';
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

<div class="crm-ui-studio-root">

  <!-- Left Pane: Configuration Form -->
  <div class="crm-ui-studio-editor">
    <div class="px-8 pt-6 pb-4 border-b border-gray-200">
      <h1 class="crm-ui-page-title">My App</h1>
      <p class="text-sm text-gray-500 mt-1">Preview changes here, then publish them to your family app.</p>
    </div>

    <div class="flex border-b border-gray-200 px-6 pt-2">
      {#each tabs as tab}
        <button
          type="button"
          disabled={submitState === 'loading'}
          aria-pressed={activeTab === tab}
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab !== tab ? 'border-transparent text-gray-500 hover:text-gray-700' : ''}"
          style={activeTab === tab ? `border-color: ${primaryColor}; color: ${primaryColor};` : ''}
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
        {#if publishRequestId}<p class="mt-1 text-xs">Support request: {publishRequestId}</p>{/if}
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
              maxlength="160"
              disabled={submitState === 'loading'}
              class="crm-ui-studio-name"
              style="outline-color: {primaryColor}"
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
                  The permanent name identifies the tab's purpose. Change only the display name families see.
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

            <div class="space-y-4">
              {#each tabsConfig as tab (tab.key)}
                <div class="crm-ui-studio-module-row">
                  <div class="min-w-0 flex-1 pr-4">
                    <h4 class="text-sm font-semibold text-gray-900">
                      {permanentTabName(tab)}
                    </h4>
                    <label for={`studio-tab-name-${tab.key}`} class="block text-xs font-medium text-gray-600">
                      Display name
                    </label>
                    <input
                      id={`studio-tab-name-${tab.key}`}
                      type="text"
                      bind:value={tab.label}
                      aria-label={`Display name for ${permanentTabName(tab)}`}
                      maxlength="80"
                      disabled={submitState === 'loading'}
                      class="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none"
                      style="outline-color: {primaryColor}"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={submitState === 'loading'}
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {tab.enabled ? '' : 'bg-gray-200'}"
                    style={tab.enabled ? `background-color: ${primaryColor};` : ''}
                    aria-label={`${tab.enabled ? 'Hide' : 'Show'} ${permanentTabName(tab)} tab`}
                    aria-pressed={tab.enabled}
                    on:click={() => { tab.enabled = !tab.enabled; tabsConfig = tabsConfig; }}
                  >
                    <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {tab.enabled ? 'translate-x-5' : 'translate-x-0'}"></span>
                  </button>
                </div>
              {/each}

              {#if tabsConfig.length === 0}
                <p class="text-sm text-gray-500">No app tabs are configured for this program.</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
    <div class="crm-ui-studio-actions">
      <StatusButton
        type="button"
        state={submitState}
        on:click={handlePublish}
        disabled={!canPublish}
        idleText="Publish App"
        loadingText="Publishing..."
        successText="Saved!"
        errorText="Retry Publish"
        class="crm-ui-studio-publish"
        style="background-color: {primaryColor};"
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
    <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(#00a4bd 1px, transparent 1px); background-size: 20px 20px;"></div>

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
          disabled={submitState === 'loading'}
        />

        <div class="border-l border-gray-200 pl-6">
          <p class="crm-ui-label-caps">Brand Colors</p>
          <div class="flex flex-wrap gap-4">
            <!-- Primary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={primaryColor} aria-label="Primary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {primaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Primary</div>
              </div>
              <input type="text" bind:value={primaryColor} aria-label="Primary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" style="outline-color: {primaryColor}" />
            </div>
            <!-- Secondary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={secondaryColor} aria-label="Secondary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {secondaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Secondary</div>
              </div>
              <input type="text" bind:value={secondaryColor} aria-label="Secondary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" style="outline-color: {primaryColor}" />
            </div>
            <!-- Tertiary Color -->
            <div class="flex flex-col space-y-1">
              <div class="flex items-center space-x-2">
                <div class="crm-ui-studio-color-swatch">
                  <input type="color" bind:value={tertiaryColor} aria-label="Tertiary brand color" disabled={submitState === 'loading'} class="crm-ui-studio-color-picker" />
                  <div class="absolute inset-0 z-0" style="background-color: {tertiaryColor}"></div>
                </div>
                <div class="text-xs text-gray-500 font-medium">Tertiary</div>
              </div>
              <input type="text" bind:value={tertiaryColor} aria-label="Tertiary brand color hex value" maxlength="7" pattern={'^#[0-9a-fA-F]{6}$'} disabled={submitState === 'loading'} class="crm-ui-studio-color-hex" style="outline-color: {primaryColor}" />
            </div>
          </div>
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
