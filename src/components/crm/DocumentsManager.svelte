<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTenantRole, tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type CrmDocumentRecord,
  } from '../../lib/api/BackendApi';
  import { modalFocus } from '../../lib/ui/modalFocus';

  const DOCUMENT_LIMIT = 100;

  let documents: CrmDocumentRecord[] = [];
  let activeTenantId = '';
  let loadGeneration = 0;
  let isLoading = true;
  let loadError = '';
  let requestId = '';
  let truncated = false;
  let accessDocumentId = '';
  let operationMessage = '';
  let operationRequestId = '';
  let blockedAccessUrl = '';
  let deleteTarget: CrmDocumentRecord | null = null;
  let deleteState: 'idle' | 'loading' | 'error' = 'idle';
  let deleteIdempotencyKey = '';

  onMount(() => {
    const unsubscribe = tenantIdStore.subscribe((tenantId) => {
      loadGeneration += 1;
      activeTenantId = tenantId || '';
      documents = [];
      loadError = '';
      requestId = '';
      truncated = false;
      accessDocumentId = '';
      operationMessage = '';
      operationRequestId = '';
      blockedAccessUrl = '';
      closeDeleteDialog(true);
      if (tenantId) void fetchDocuments(tenantId);
      else isLoading = false;
    });
    return unsubscribe;
  });

  function supportRequest(error: unknown) {
    return error instanceof BackendApiError ? error.requestId || '' : '';
  }

  async function fetchDocuments(tenantId: string) {
    const generation = ++loadGeneration;
    isLoading = true;
    loadError = '';
    requestId = '';
    try {
      const page = await backendClient.documents(tenantId, DOCUMENT_LIMIT);
      if (generation !== loadGeneration || tenantId !== activeTenantId) return;
      if (page.tenantId !== tenantId) {
        throw new Error('The document response did not match the selected organization.');
      }
      documents = page.documents;
      truncated = page.truncated;
      requestId = page.requestId;
    } catch (error) {
      if (generation !== loadGeneration || tenantId !== activeTenantId) return;
      loadError = error instanceof BackendApiError && error.status === 403
        ? 'You do not have permission to view organization documents.'
        : 'Documents could not be loaded. Check your connection and try again.';
      requestId = supportRequest(error);
    } finally {
      if (generation === loadGeneration && tenantId === activeTenantId) {
        isLoading = false;
      }
    }
  }

  async function handleViewDocument(documentRecord: CrmDocumentRecord) {
    if (accessDocumentId) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) return;
    accessDocumentId = documentRecord.id;
    operationMessage = '';
    operationRequestId = '';
    blockedAccessUrl = '';
    try {
      const access = await backendClient.documentAccessUrl(tenantId, documentRecord.id);
      if (tenantId !== $tenantIdStore || access.documentId !== documentRecord.id) return;
      const parsed = new URL(access.accessUrl);
      if (parsed.protocol !== 'https:') {
        throw new Error('The secure document URL was invalid.');
      }
      const openedWindow = window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        blockedAccessUrl = parsed.toString();
        operationMessage =
          `Your browser blocked the secure document tab. Use the secure link below within ${access.expiresInSeconds} seconds.`;
      } else {
        operationMessage = `Secure access opened in a new tab. The link expires in ${access.expiresInSeconds} seconds.`;
      }
    } catch (error) {
      operationMessage = 'Secure document access could not be created.';
      operationRequestId = supportRequest(error);
    } finally {
      accessDocumentId = '';
    }
  }

  function openDeleteDialog(documentRecord: CrmDocumentRecord) {
    if (!canManageTenant || !documentRecord.canDelete) return;
    deleteTarget = documentRecord;
    deleteState = 'idle';
    deleteIdempotencyKey = createIdempotencyKey(
      `document-delete-${documentRecord.id}`,
    );
  }

  function closeDeleteDialog(force = false) {
    if (!force && deleteState === 'loading') return;
    deleteTarget = null;
    deleteState = 'idle';
    deleteIdempotencyKey = '';
  }

  async function confirmDelete() {
    if (!deleteTarget || !canManageTenant || !deleteTarget.canDelete || deleteState === 'loading') return;
    const tenantId = $tenantIdStore;
    const documentId = deleteTarget.id;
    if (!tenantId || !deleteIdempotencyKey) return;

    deleteState = 'loading';
    operationMessage = '';
    operationRequestId = '';
    try {
      const result = await backendClient.deleteDocument(
        tenantId,
        documentId,
        'Delete this document metadata and its approved stored object from the organization library.',
        deleteIdempotencyKey,
      );
      if (tenantId !== $tenantIdStore) return;
      operationMessage = result.storageDeleted === false
        ? 'Document metadata was deleted, but the server did not confirm stored-object deletion. Contact support.'
        : 'Document and its stored object were deleted.';
      closeDeleteDialog(true);
      await fetchDocuments(tenantId);
    } catch (error) {
      if (tenantId !== $tenantIdStore) return;
      deleteState = 'error';
      operationMessage = 'The document could not be deleted. Retry uses the same operation key.';
      operationRequestId = supportRequest(error);
    }
  }

  $: canManageTenant =
    $activeTenantRole === 'owner'
    || $activeTenantRole === 'platform_admin'
    || $activeTenantRole === 'editor';
</script>

{#if deleteTarget}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="delete-document-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        type="button"
        class="fixed inset-0 z-0 h-full w-full bg-slate-950/70"
        aria-label="Close delete document confirmation"
        tabindex="-1"
        disabled={deleteState === 'loading'}
        on:click={() => closeDeleteDialog()}
      ></button>
      <div
        class="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        tabindex="-1"
        use:modalFocus={{ onEscape: () => closeDeleteDialog(), initialFocusSelector: '[data-delete-cancel]' }}
      >
        <h3 id="delete-document-title" class="text-lg font-semibold text-gray-900">Delete document?</h3>
        <p class="mt-2 text-sm text-gray-600">
          Delete “{deleteTarget.title}” and its approved stored object. This cannot be undone.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-delete-cancel
            disabled={deleteState === 'loading'}
            class="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            on:click={() => closeDeleteDialog()}
          >Cancel</button>
          <button
            type="button"
            disabled={deleteState === 'loading'}
            class="crm-ui-danger-button"
            on:click={confirmDelete}
          >{deleteState === 'loading' ? 'Deleting…' : deleteState === 'error' ? 'Retry delete' : 'Delete document'}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="flex h-full flex-col space-y-6 overflow-y-auto p-4 sm:p-6">
  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">Documents & Resources</h2>
      <p class="text-sm text-gray-500">Review securely stored resources available to your organization.</p>
    </div>
    <p class="max-w-md rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Uploads are unavailable until the audited tenant Storage workflow is enabled.
    </p>
  </div>

  {#if operationMessage}
    <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700" role={deleteState === 'error' ? 'alert' : 'status'}>
      <p>{operationMessage}</p>
      {#if blockedAccessUrl}
        <a
          href={blockedAccessUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 inline-flex break-all font-medium text-blue-700 underline"
        >Open secure document link</a>
      {/if}
      {#if operationRequestId}<p class="mt-1 text-xs">Support request: {operationRequestId}</p>{/if}
    </div>
  {/if}

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="document-list-title">
    <div class="border-b border-gray-200 p-4">
      <h3 id="document-list-title" class="font-semibold text-gray-900">Available documents</h3>
      <p class="crm-ui-hint">Showing up to {DOCUMENT_LIMIT} server-authorized records.</p>
      {#if truncated}
        <p class="crm-ui-notice-spaced" role="status">
          More documents exist. This view is not a complete library.
        </p>
      {/if}
    </div>
    {#if isLoading}
      <div class="p-8 text-center text-gray-500" role="status">Loading documents…</div>
    {:else if loadError}
      <div class="p-8 text-center" role="alert">
        <p class="text-sm text-red-700">{loadError}</p>
        {#if requestId}<p class="mt-1 text-xs text-red-700">Support request: {requestId}</p>{/if}
        <button type="button" class="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm" on:click={() => activeTenantId && fetchDocuments(activeTenantId)}>Try again</button>
      </div>
    {:else if documents.length === 0}
      <div class="p-8 text-center text-gray-500">No documents are available.</div>
    {:else}
      <ul class="divide-y divide-gray-200">
        {#each documents as documentRecord (documentRecord.id)}
          <li class="flex flex-col gap-4 p-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="break-words text-sm font-medium text-gray-900">{documentRecord.title || 'Document title unavailable'}</p>
              <p class="crm-ui-hint">
                {documentRecord.fileType || 'File type unavailable'} ·
                {documentRecord.category || 'Category unavailable'} ·
                {documentRecord.uploadedAt ? new Date(documentRecord.uploadedAt).toLocaleDateString() : 'Upload date unavailable'}
              </p>
              <p class="crm-ui-hint">{documentRecord.availabilityScope || 'Availability scope unavailable'}</p>
              {#if !documentRecord.canDelete && documentRecord.deleteUnavailableReason}
                <p class="crm-ui-hint">{documentRecord.deleteUnavailableReason}</p>
              {/if}
            </div>
            <div class="flex shrink-0 flex-wrap gap-4">
              <button
                type="button"
                disabled={!documentRecord.isAvailable || !documentRecord.hasApprovedStoragePath || Boolean(accessDocumentId)}
                title={!documentRecord.hasApprovedStoragePath ? 'No approved stored object is available.' : undefined}
                class="text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
                on:click={() => handleViewDocument(documentRecord)}
              >{accessDocumentId === documentRecord.id ? 'Opening…' : 'View securely'}</button>
              <button
                type="button"
                disabled={!canManageTenant || !documentRecord.canDelete}
                title={!canManageTenant
                  ? 'Viewer access is read-only.'
                  : documentRecord.deleteUnavailableReason || undefined}
                class="text-sm font-medium text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-gray-400"
                on:click={() => openDeleteDialog(documentRecord)}
              >Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
