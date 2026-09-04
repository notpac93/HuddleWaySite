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

  $: sessionKey = `${previewOrigin || ''}|${tenantId}|${environment}`;
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
  }

  function handleLoad() {
    if (!session) return;
    state = 'awaiting';
    clearHandshakeTimer();
    handshakeTimer = window.setTimeout(() => {
      if (state === 'synced') return;
      state = 'error';
      errorMessage = 'The preview app did not prove its environment and version. Reload before trusting this preview.';
    }, 8000);
  }

  function postDraft() {
    if (
      !frame?.contentWindow
      || !previewOrigin
      || !pendingPayload
      || state === 'error'
    ) return;
    frame.contentWindow.postMessage(pendingPayload, previewOrigin);
  }

  function handleMessage(event: MessageEvent) {
    if (
      !session
      || !previewOrigin
      || event.origin !== previewOrigin
      || event.source !== frame?.contentWindow
    ) return;
    const payload = parseAppPreviewMessage(event.data, session);
    if (!payload) return;
    if (payload.type === 'huddleway.crm.preview.field-selected') {
      const fieldId = String(payload.fieldId || '').trim();
      if (fieldId) onFieldSelected(fieldId);
      return;
    }
    if (payload.type === 'huddleway.crm.preview.rejected') {
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
        state = 'error';
        errorMessage = 'The preview artifact does not match the selected environment or approved release.';
        clearHandshakeTimer();
        return;
      }
      state = 'awaiting';
      postDraft();
      return;
    }
    if (
      payload.type === 'huddleway.crm.preview.applied'
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
  <div class:crm-ui-studio-device-compact={compact} class="crm-ui-studio-device">
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
