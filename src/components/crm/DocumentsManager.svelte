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
  import { eventsStore } from '../../lib/services/DataStore';
  import DocumentEditor from './documents/DocumentEditor.svelte';
  import PageHeader from './ui/PageHeader.svelte';
  import EmptyState from './ui/EmptyState.svelte';

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
  let deleteReason = '';
  let editorRecord: CrmDocumentRecord | null | undefined = undefined;
  let searchQuery = '';
  let categoryFilter = 'all';
  let audienceFilter = 'all';
  let availabilityFilter = 'all';

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
      editorRecord = undefined;
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
    deleteReason = '';
    deleteIdempotencyKey = createIdempotencyKey(
      `document-delete-${documentRecord.id}`,
    );
  }

  function closeDeleteDialog(force = false) {
    if (!force && deleteState === 'loading') return;
    deleteTarget = null;
    deleteState = 'idle';
    deleteIdempotencyKey = '';
    deleteReason = '';
  }

  async function confirmDelete() {
    if (!deleteTarget || !canManageTenant || !deleteTarget.canDelete || deleteReason.trim().length < 8 || deleteState === 'loading') return;
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
        deleteReason.trim(),
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
  $: eventOptions = $eventsStore.map((event) => ({
    id: String(event.id || ''),
    title: String(event.title || event.name || event.id || 'Untitled event'),
  })).filter((event) => event.id);
  $: categories = [...new Set(documents.map((record) => record.category).filter(Boolean) as string[])].sort();
  $: filteredDocuments = documents.filter((record) => {
    const query = searchQuery.trim().toLowerCase();
    return (!query || [record.title, record.category, record.fileType, record.uploadedBy]
      .some((value) => String(value || '').toLowerCase().includes(query)))
      && (categoryFilter === 'all' || record.category === categoryFilter)
      && (audienceFilter === 'all' || record.availabilityScope === audienceFilter)
      && (availabilityFilter === 'all' || (availabilityFilter === 'available') === record.isAvailable);
  });
</script>

{#if editorRecord !== undefined}
  <DocumentEditor
    record={editorRecord}
    events={eventOptions}
    on:close={() => editorRecord = undefined}
    on:saved={async () => {
      editorRecord = undefined;
      operationMessage = 'Document library updated.';
      if (activeTenantId) await fetchDocuments(activeTenantId);
    }}
  />
{/if}

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
          It is linked to {deleteTarget.linkedEventIds?.length || 0} event{(deleteTarget.linkedEventIds?.length || 0) === 1 ? '' : 's'}.
        </p>
        <label class="mt-4 block text-sm font-medium text-gray-700">Audit reason
          <textarea class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={deleteReason} rows="2" maxlength="300" placeholder="Why must this file be permanently deleted?"></textarea>
          <span class="crm-ui-hint">Use Edit to make a document unavailable without deleting its history.</span>
        </label>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-delete-cancel
            disabled={deleteState === 'loading' || deleteReason.trim().length < 8}
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
  <PageHeader title="Documents & Resources" support="Upload, publish, find, and securely manage organization resources.">
    <svelte:fragment slot="actions">
      <button type="button" class="crm-ui-primary-button" disabled={!canManageTenant} title={!canManageTenant ? 'Viewer access is read-only.' : undefined} on:click={() => editorRecord = null}>Upload document</button>
    </svelte:fragment>
  </PageHeader>

  {#if operationMessage}
    <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700" role={deleteState === 'error' ? 'alert' : 'status'}>
      <p>{operationMessage}</p>
      {#if blockedAccessUrl}
        <a
          href={blockedAccessUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="crm-theme-link mt-2 inline-flex break-all font-medium underline"
        >Open secure document link</a>
      {/if}
    </div>
  {/if}

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="document-list-title">
    <div class="border-b border-gray-200 p-4">
      <h3 id="document-list-title" class="font-semibold text-gray-900">Available documents</h3>
      <p class="crm-ui-hint">{documents.length} available</p>
      {#if truncated}
        <p class="crm-ui-notice-spaced" role="status">
          More documents are available.
        </p>
      {/if}
      <div class="mt-4 grid gap-3 md:grid-cols-4">
        <label class="text-sm">Search
          <input type="search" class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={searchQuery} placeholder="Title, category, type, uploader" />
        </label>
        <label class="text-sm">Category
          <select class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={categoryFilter}><option value="all">All categories</option>{#each categories as category}<option value={category}>{category}</option>{/each}</select>
        </label>
        <label class="text-sm">Audience
          <select class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={audienceFilter}><option value="all">All audiences</option><option value="organization">Entire organization</option><option value="selected_live_events">Selected live events</option><option value="saved_for_later">Saved for later</option></select>
        </label>
        <label class="text-sm">Availability
          <select class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={availabilityFilter}><option value="all">Any availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
        </label>
      </div>
    </div>
    {#if isLoading}
      <div class="p-8 text-center text-gray-500" role="status">Loading documents…</div>
    {:else if loadError}
      <div class="p-8 text-center" role="alert">
        <p class="text-sm text-red-700">{loadError}</p>
        <button type="button" class="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm" on:click={() => activeTenantId && fetchDocuments(activeTenantId)}>Try again</button>
      </div>
    {:else if documents.length === 0}
      <EmptyState title="No documents yet" message={canManageTenant ? 'Upload the first resource, assign its audience, and review it before publication.' : 'An organization owner or editor can upload documents here.'} primaryLabel={canManageTenant ? 'Upload document' : ''} onPrimary={() => editorRecord = null} />
    {:else if filteredDocuments.length === 0}
      <EmptyState title="No matching documents" message="Adjust or clear the document filters." primaryLabel="Clear filters" onPrimary={() => { searchQuery = ''; categoryFilter = 'all'; audienceFilter = 'all'; availabilityFilter = 'all'; }} />
    {:else}
      <ul class="divide-y divide-gray-200">
        {#each filteredDocuments as documentRecord (documentRecord.id)}
          <li class="flex flex-col gap-4 p-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="break-words text-sm font-medium text-gray-900">{documentRecord.title || 'Document title unavailable'}</p>
              <p class="crm-ui-hint">
                {documentRecord.fileType || 'File type unavailable'} ·
                {documentRecord.category || 'Category unavailable'} ·
                {documentRecord.uploadedAt ? new Date(documentRecord.uploadedAt).toLocaleDateString() : 'Upload date unavailable'}
              </p>
              <p class="crm-ui-hint">{documentRecord.availabilityScope || 'Availability scope unavailable'}</p>
              <p class="crm-ui-hint">
                {documentRecord.storageSizeBytes ? `${(documentRecord.storageSizeBytes / 1024 / 1024).toFixed(2)} MB` : 'Size unavailable'} ·
                {documentRecord.linkedEventIds?.length || 0} linked event{(documentRecord.linkedEventIds?.length || 0) === 1 ? '' : 's'} ·
                {documentRecord.isAvailable ? 'Available' : 'Unavailable'}
              </p>
              {#if !documentRecord.canDelete && documentRecord.deleteUnavailableReason}
                <p class="crm-ui-hint">{documentRecord.deleteUnavailableReason}</p>
              {/if}
            </div>
            <div class="flex shrink-0 flex-wrap gap-4">
              <button type="button" disabled={!canManageTenant || !documentRecord.storagePath} title={!canManageTenant ? 'Viewer access is read-only.' : !documentRecord.storagePath ? 'Repair the approved storage object before editing.' : undefined} class="crm-theme-link text-sm font-medium disabled:text-gray-400" on:click={() => editorRecord = documentRecord}>Edit</button>
              <button
                type="button"
                disabled={!documentRecord.isAvailable || !documentRecord.hasApprovedStoragePath || Boolean(accessDocumentId)}
                title={!documentRecord.hasApprovedStoragePath ? 'No approved stored object is available.' : undefined}
                class="crm-theme-link text-sm font-medium disabled:cursor-not-allowed disabled:text-gray-400"
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
