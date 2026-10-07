<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { CrmAppConfiguration } from '../../../lib/api/BackendApi';
  import {
    buildAppPreviewUpdate,
    buildAppPreviewUrl,
    createAppPreviewSession,
    parseAppPreviewMessage,
    type AppComponentPreviewDraft,
    type AppPreviewEnvironment,
    type AppPreviewSession,
  } from '../../../lib/crm/appPreviewProtocol';

  export let previewOrigin: string | null;
  export let tenantId: string;
  export let environment: AppPreviewEnvironment;
  export let configuration: CrmAppConfiguration;
  export let configurationReady: boolean;
  export let title: string;
  export let expectedSourceCommit = '';
  export let expectedReleaseId = '';
  export let componentDraft: AppComponentPreviewDraft | null = null;
  export let onFieldSelected: (fieldId: string) => void = () => {};
  export let compact = false;

  let frame: HTMLIFrameElement | null = null;
  let session: AppPreviewSession | null = null;
  let previewSrc = '';
  let state: 'idle' | 'loading' | 'awaiting' | 'synced' | 'error' = 'idle';
  let errorMessage = '';
  let revision = 0;
  let lastConfiguration = '';
  let pendingPayload = '';
  let handshakeTimer: number | null = null;
  let attested = false;
  let lastFrameMessage = 'none';

  $: sessionKey = `${previewOrigin || ''}|${tenantId}|${environment}|${expectedSourceCommit}|${expectedReleaseId}`;
  $: if (sessionKey) resetSession(sessionKey);
  $: serializedConfiguration = JSON.stringify({ configuration, componentDraft });
  $: if (
    session
    && configurationReady
    && serializedConfiguration !== lastConfiguration
  ) {
    lastConfiguration = serializedConfiguration;
    revision += 1;
    pendingPayload = buildAppPreviewUpdate(
      session,
      revision,
      configuration,
      componentDraft,
    );
    if (state === 'awaiting' || state === 'synced') queueMicrotask(postDraft);
  }

  function resetSession(_key: string) {
    clearHandshakeTimer();
    revision = 0;
    lastConfiguration = '';
    pendingPayload = '';
    attested = false;
    lastFrameMessage = 'none';
    errorMessage = '';
    if (!previewOrigin || !tenantId) {
      session = null;
      previewSrc = '';
      state = 'idle';
      return;
    }
    session = createAppPreviewSession(tenantId, environment);
    previewSrc = buildAppPreviewUrl(
      previewOrigin,
      window.location.origin,
      session,
    );
    state = 'loading';
    startHandshakeTimer(30000);
  }

  function handleLoad() {
    // Flutter may send ready/applied before the iframe's load event.
    // A late load must not turn an already verified preview into a spinner.
    if (!session || state === 'synced' || state === 'error') return;
    state = 'awaiting';
  }

  function startHandshakeTimer(milliseconds: number) {
    clearHandshakeTimer();
    handshakeTimer = window.setTimeout(() => {
      if (state === 'synced') return;
      attested = false;
      state = 'error';
      errorMessage = 'The preview app did not prove its environment and version. Reload before trusting this preview.';
    }, milliseconds);
  }

  function postDraft() {
    if (
      !frame?.contentWindow
      || !previewOrigin
      || !pendingPayload
      || !attested
      || state === 'error'
    ) return;
    state = 'awaiting';
    startHandshakeTimer(8000);
    frame.contentWindow.postMessage(pendingPayload, previewOrigin);
  }

  function handleMessage(event: MessageEvent) {
    if (
      !session
      || state === 'error'
      || !previewOrigin
      || event.origin !== previewOrigin
    ) return;
    if (event.source !== frame?.contentWindow) {
      lastFrameMessage = 'wrong-source';
      return;
    }
    const payload = parseAppPreviewMessage(event.data, session);
    if (!payload) {
      lastFrameMessage = 'invalid-envelope';
      return;
    }
    lastFrameMessage = String(payload.type).replace('huddleway.crm.preview.', '');
    if (payload.type === 'huddleway.crm.preview.field-selected') {
      if (!attested) return;
      const fieldId = String(payload.fieldId || '').trim();
      if (fieldId) onFieldSelected(fieldId);
      return;
    }
    if (payload.type === 'huddleway.crm.preview.rejected') {
      attested = false;
      state = 'error';
      errorMessage = `The consumer app rejected the draft (${String(payload.reason || 'unknown')}). Reload before trusting this preview.`;
      clearHandshakeTimer();
      return;
    }
    if (payload.type === 'huddleway.crm.preview.ready') {
      const sourceCommit = String(payload.sourceCommit || '').trim();
      const releaseId = String(payload.releaseId || '').trim();
      const requiresAttestation = environment !== 'dev';
      const mismatchedCommit = expectedSourceCommit
        && sourceCommit !== expectedSourceCommit;
      const mismatchedRelease = expectedReleaseId
        && releaseId !== expectedReleaseId;
      if (
        (requiresAttestation && (
          !sourceCommit
          || !releaseId
          || sourceCommit === 'local-unattested'
          || releaseId === 'local-unattested'
        ))
        || mismatchedCommit
        || mismatchedRelease
      ) {
        attested = false;
        state = 'error';
        errorMessage = 'The preview artifact does not match the selected environment or approved release.';
        clearHandshakeTimer();
        return;
      }
      attested = true;
      state = 'awaiting';
      postDraft();
      return;
    }
    if (
      payload.type === 'huddleway.crm.preview.applied'
      && attested
      && revision > 0
      && payload.revision === revision
    ) {
      state = 'synced';
      clearHandshakeTimer();
    }
  }

  function clearHandshakeTimer() {
    if (handshakeTimer !== null) window.clearTimeout(handshakeTimer);
    handshakeTimer = null;
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });
  onDestroy(clearHandshakeTimer);
</script>

<div class="flex flex-1 flex-col items-center justify-start {compact ? 'py-2' : 'py-4'}">
  <div class:crm-ui-studio-device-compact={compact} class="crm-ui-studio-device"
    data-preview-state={state} data-preview-attested={attested}
    data-preview-revision={revision} data-preview-configuration-ready={configurationReady}
    data-preview-last-message={lastFrameMessage}>
    <div class="crm-ui-studio-notch"></div>
    {#if tenantId && previewSrc}
      <iframe
        bind:this={frame}
        src={previewSrc}
        title={title}
        class="crm-ui-studio-app-frame"
        allow="clipboard-read; clipboard-write; fullscreen"
        on:load={handleLoad}
      ></iframe>
      {#if state !== 'synced'}
        <div
          class={state === 'error'
            ? 'crm-ui-studio-preview-loading bg-red-50 text-red-900'
            : 'crm-ui-studio-preview-loading'}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {#if state === 'error'}
            <p>{errorMessage}</p>
            <button
              type="button"
              class="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold"
              on:click={() => resetSession(sessionKey)}
            >Reload preview</button>
          {:else}
            Verifying the exact consumer app…
          {/if}
        </div>
      {/if}
    {:else if !previewOrigin}
      <div class="crm-ui-studio-empty-preview">The mobile preview is unavailable in this environment.</div>
    {:else}
      <div class="crm-ui-studio-empty-preview">Select an organization to preview.</div>
    {/if}
  </div>
</div>
