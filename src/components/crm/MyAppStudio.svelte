<script lang="ts">
  import { db } from '../../lib/firebase';
  import { tenantIdStore } from '../../lib/authStore';
  import { onDestroy } from 'svelte';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type CrmAppConfiguration,
  } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';


  // Form Configurator State
  let primaryColor = '';
  let secondaryColor = '';
  let tertiaryColor = '';
  let appName = '';
  let tabsConfig = [];
  let logoUrl = null;
  let configVersionToken = '';
  let configMode: 'initialize' | 'update' = 'initialize';
  let configLoadState: 'idle' | 'loading' | 'ready' | 'error' | 'permission' = 'idle';
  let configLoadMessage = '';
  let loadedConfigSignature = '';
  let configLoadSequence = 0;
  let rosterPreviewError = '';
  let schedulePreviewError = '';
  let publishMessage = '';
  let publishRequestId = '';
  let publishIdempotencyKey = createIdempotencyKey('app-configuration-publish');
  let publishAttemptSignature = '';
  let currentConfigSignature = '';
  let currentAttemptSignature = '';
  let activeTenantId = '';

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  const initialTabs = [
    { key: 'home', pageId: 'home_page', route: '/', label: 'Home', enabled: true },
    { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'Team', enabled: true },
    { key: 'events', pageId: 'events_page', route: '/events', label: 'Events', enabled: true },
    { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'Board', enabled: true },
    { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'Schedule', enabled: true },
  ];

  function buildConfigSignature() {
    return JSON.stringify({
      appName: appName.trim(),
      primaryColor,
      secondaryColor,
      tertiaryColor,
      tabsConfig,
      logoUrl,
    });
  }

  function buildAttemptSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      configuration: buildConfigSignature(),
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
    currentConfigSignature = buildConfigSignature();
  }
  $: isDirty =
    configLoadState === 'ready'
    && currentConfigSignature !== loadedConfigSignature;
  $: configIsValid =
    appName.trim().length > 0
    && appName.trim().length <= 160
    && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    && /^#[0-9a-fA-F]{6}$/.test(secondaryColor)
    && /^#[0-9a-fA-F]{6}$/.test(tertiaryColor)
    && tabsConfig.length > 0
    && tabsConfig.length <= 12
    && new Set(tabsConfig.map((tab) => tab.key)).size === tabsConfig.length
    && tabsConfig.every(
      (tab) =>
        tab.key
        && tab.pageId
        && tab.label
        && tab.label.length <= 80
        && tab.route?.startsWith('/')
        && !tab.route.startsWith('//'),
    );
  $: canPublish =
    configLoadState === 'ready'
    && Boolean(configVersionToken)
    && configIsValid
    && isDirty
    && submitState !== 'loading';
  $: currentAttemptSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    configuration: currentConfigSignature,
    configMode,
    configVersionToken,
  });
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
    unsubscribeRoster();
    unsubscribeSchedule();
    primaryColor = '';
    secondaryColor = '';
    tertiaryColor = '';
    appName = '';
    tabsConfig = [];
    logoUrl = null;
    loadedConfigSignature = '';
    configVersionToken = '';
    publishAttemptSignature = '';
    publishIdempotencyKey =
      createIdempotencyKey('app-configuration-publish');
    publishMessage = '';
    publishRequestId = '';
    submitState = 'idle';
    rosterPreview = [];
    schedulePreview = null;
    rosterPreviewError = '';
    schedulePreviewError = '';
    if (activeTenantId) {
      loadTenantConfig(activeTenantId);
      loadRosterPreview(activeTenantId);
      loadSchedulePreview(activeTenantId);
    } else {
      configLoadSequence += 1;
      configLoadState = 'idle';
      configLoadMessage = '';
      rosterPreviewLoading = false;
      schedulePreviewLoading = false;
    }
  }

  let rosterPreview = [];
  let rosterPreviewLoading = false;
  let unsubscribeRoster = () => {};

  import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
  } from 'firebase/firestore';

  function loadRosterPreview(tenantId) {
    unsubscribeRoster();
    rosterPreview = [];
    rosterPreviewLoading = true;
    const q = query(
      collection(db, 'registrations'),
      where('tenantId', '==', tenantId),
      limit(4)
    );
    rosterPreviewError = '';
    unsubscribeRoster = onSnapshot(
      q,
      (snapshot) => {
        if ($tenantIdStore !== tenantId) return;
        rosterPreview = snapshot.docs.map(doc => {
          const data = doc.data();
          const participant =
            data.participantSummary
            && typeof data.participantSummary === 'object'
              ? data.participantSummary
              : {};
          return {
            id: doc.id,
            name:
              (typeof participant.fullName === 'string'
                ? participant.fullName.trim()
                : '')
              || (typeof participant.displayName === 'string'
                ? participant.displayName.trim()
                : '')
              || [
                typeof participant.firstName === 'string'
                  ? participant.firstName.trim()
                  : '',
                typeof participant.lastName === 'string'
                  ? participant.lastName.trim()
                  : '',
              ].filter(Boolean).join(' ')
              || null,
          };
        });
        rosterPreviewLoading = false;
      },
      () => {
        if ($tenantIdStore !== tenantId) return;
        console.error('Roster preview could not be loaded.');
        rosterPreview = [];
        rosterPreviewLoading = false;
        rosterPreviewError = 'Roster preview unavailable.';
      },
    );
  }

  let schedulePreview = null;
  let schedulePreviewLoading = false;
  let unsubscribeSchedule = () => {};

  function loadSchedulePreview(tenantId) {
    unsubscribeSchedule();
    schedulePreview = null;
    schedulePreviewLoading = true;
    const q = query(
      collection(db, 'events'),
      where('tenantId', '==', tenantId),
      where('status', '==', 'published'),
      where('isVisible', '==', true),
      where('isDeleted', '==', false),
      where('date', '>=', new Date()),
      orderBy('date', 'asc'),
      limit(1),
    );
    schedulePreviewError = '';
    unsubscribeSchedule = onSnapshot(
      q,
      (snapshot) => {
        if ($tenantIdStore !== tenantId) return;
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          schedulePreview = {
            id: snapshot.docs[0].id,
            title: data.title || null,
            date: data.date?.toDate ? data.date.toDate() : null,
            location: data.location || null,
          };
        } else {
          schedulePreview = null;
        }
        schedulePreviewLoading = false;
      },
      () => {
        if ($tenantIdStore !== tenantId) return;
        console.error('Schedule preview could not be loaded.');
        schedulePreview = null;
        schedulePreviewLoading = false;
        schedulePreviewError = 'Schedule preview unavailable.';
      },
    );
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
      } else {
        primaryColor = '';
        secondaryColor = '';
        tertiaryColor = '';
        appName = '';
        logoUrl = null;
        // Defaults are offered only after the backend confirms initialize mode.
        tabsConfig = initialTabs.map((tab) => ({ ...tab }));
      }
      loadedConfigSignature = buildConfigSignature();
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
      configLoadMessage = configLoadState === 'permission'
        ? 'You do not have permission to edit app configuration.'
        : 'The authoritative app configuration could not be loaded. Publishing is disabled.';
      publishRequestId = e instanceof BackendApiError ? e.requestId || '' : '';
    }
  }

  onDestroy(() => {
    configLoadSequence += 1;
    unsubscribeRoster();
    unsubscribeSchedule();
  });

  async function handlePublish() {
    if (!canPublish || submitState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) return;

    const configuration: CrmAppConfiguration = {
      name: appName.trim(),
      primaryColor,
      secondaryColor,
      tertiaryColor,
      logoUrl,
      navigationTabs: tabsConfig.map((tab) => ({ ...tab })),
    };
    const expectedVersionToken = configVersionToken;
    const mode = configMode;
    const submittedSignature = buildConfigSignature();
    submitState = 'loading';
    publishMessage = '';
    publishRequestId = '';
    try {
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
      <h1 class="crm-ui-page-title">Page Studio</h1>
      <p class="text-sm text-gray-500 mt-1">Configure your public-facing app for parents and players.</p>
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
      <p class="crm-ui-studio-error" role="alert">{configLoadMessage}</p>
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
            <h3 class="text-sm font-medium text-gray-900 mb-4">Active Modules</h3>

            <div class="space-y-4">
              {#each tabsConfig as tab (tab.key)}
                <div class="crm-ui-studio-module-row">
                  <div>
                    <p class="text-sm font-medium text-gray-700">{tab.label}</p>
                    <p class="crm-ui-hint-xs">Route: {tab.route}</p>
                  </div>
                  <button
                    type="button"
                    disabled={submitState === 'loading'}
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {tab.enabled ? '' : 'bg-gray-200'}"
                    style={tab.enabled ? `background-color: ${primaryColor};` : ''}
                    aria-label={`${tab.enabled ? 'Disable' : 'Enable'} ${tab.label} module`}
                    aria-pressed={tab.enabled}
                    on:click={() => { tab.enabled = !tab.enabled; tabsConfig = tabsConfig; }}
                  >
                    <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {tab.enabled ? 'translate-x-5' : 'translate-x-0'}"></span>
                  </button>
                </div>
              {/each}

              {#if tabsConfig.length === 0}
                <p class="text-sm text-gray-500">No modules found for this program.</p>
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
      {:else if !configIsValid}Provide an app name, valid six-digit hex colors, and valid modules.
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
        <div>
          <p class="crm-ui-label-caps">Logo</p>
          <div class="flex items-center space-x-3">
              <div class="crm-ui-studio-logo">
                <img
                  src={safeLogoPreviewUrl}
                  alt="Logo Preview"
                  width="80"
                  height="80"
                  decoding="async"
                  class="crm-ui-cover"
                />
              </div>
            <p class="crm-ui-notice-sm max-w-xs">Logo uploads are unavailable in this release. The existing logo is retained.</p>
          </div>
        </div>

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

    <div class="flex-1 flex items-center justify-center">
      <!-- Mobile Device Frame -->
      <div class="crm-ui-studio-device">

        <!-- Notch -->
        <div class="crm-ui-studio-notch"></div>

      <!-- Source-native app preview. The quarantined consumer build is never
           embedded in the CRM release artifact. -->
      {#if $tenantIdStore}
        <div class="crm-ui-studio-app" aria-label="App configuration preview">
          <header class="crm-ui-studio-app-header" style="background-color: {primaryColor || '#334155'}">
            <img src={safeLogoPreviewUrl} alt="" width="36" height="36" class="crm-ui-studio-app-logo" />
            <div class="min-w-0">
              <p class="truncate text-base font-bold">{appName.trim() || 'App name not set'}</p>
              <p class="text-[10px] opacity-80">Configuration preview</p>
            </div>
          </header>
          <main class="crm-ui-studio-app-main">
            <section class="crm-ui-studio-app-card" aria-labelledby="preview-next-event">
              <h3 id="preview-next-event" class="crm-ui-studio-app-heading">Schedule preview</h3>
              {#if schedulePreviewLoading}
                <p class="mt-2 text-sm text-gray-500" role="status">Loading schedule preview…</p>
              {:else if schedulePreviewError}
                <p class="mt-2 text-sm text-red-700">{schedulePreviewError}</p>
              {:else if schedulePreview}
                <p class="mt-2 font-semibold text-gray-900">{schedulePreview.title || 'Event title unavailable'}</p>
                <p class="mt-1 text-xs text-gray-600">
                  {schedulePreview.date ? schedulePreview.date.toLocaleString() : 'Date unavailable'}
                  · {schedulePreview.location || 'Location unavailable'}
                </p>
              {:else}
                <p class="mt-2 text-sm text-gray-500">No event is available in the loaded preview.</p>
              {/if}
            </section>
            <section class="crm-ui-studio-app-card" aria-labelledby="preview-roster">
              <h3 id="preview-roster" class="crm-ui-studio-app-heading">Roster preview</h3>
              {#if rosterPreviewLoading}
                <p class="mt-2 text-sm text-gray-500" role="status">Loading roster preview…</p>
              {:else if rosterPreviewError}
                <p class="mt-2 text-sm text-red-700">{rosterPreviewError}</p>
              {:else if rosterPreview.length === 0}
                <p class="mt-2 text-sm text-gray-500">No player is available in the loaded preview.</p>
              {:else}
                <ul class="mt-2 divide-y divide-gray-100">
                  {#each rosterPreview as player (player.id)}
                    <li class="py-2 text-sm text-gray-700">
                      {player.name || 'Player name unavailable'}
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          </main>
          <nav class="crm-ui-studio-nav" aria-label="Enabled module preview">
            {#each tabsConfig.filter((tab) => tab.enabled).slice(0, 5) as tab (tab.key)}
              <span class="crm-ui-studio-nav-label">{tab.label}</span>
            {/each}
          </nav>
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
