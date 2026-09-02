<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { tenantIdStore, userStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import {
    BackendApiError,
    createIdempotencyKey,
    type CrmDocumentInput,
    type CrmDocumentRecord,
  } from '../../../lib/api/BackendApi';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let record: CrmDocumentRecord | null = null;
  export let events: Array<{ id: string; title: string }> = [];

  const dispatch = createEventDispatcher<{ close: void; saved: void }>();
  const allowedTypes = '.pdf,.txt,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.heic';
  let title = record?.title || '';
  let category = record?.category || 'General';
  let availabilityScope = (record?.availabilityScope || 'organization') as CrmDocumentInput['availabilityScope'];
  let isAvailable = record?.isAvailable ?? true;
  let linkedEventIds = [...(record?.linkedEventIds || [])];
  let file: File | null = null;
  let auditReason = '';
  let stage: 'edit' | 'review' | 'saving' | 'error' = 'edit';
  let errorMessage = '';
  let requestId = '';
  let operationKey = createIdempotencyKey(record ? `document-update-${record.id}` : 'document-create');

  $: selectedEvents = events.filter((event) => linkedEventIds.includes(event.id));
  $: canReview = title.trim().length > 0
    && category.trim().length > 0
    && auditReason.trim().length >= 8
    && (record ? Boolean(record.storagePath) : Boolean(file))
    && (availabilityScope !== 'selected_live_events' || linkedEventIds.length > 0);

  function toggleEvent(eventId: string) {
    linkedEventIds = linkedEventIds.includes(eventId)
      ? linkedEventIds.filter((id) => id !== eventId)
      : [...linkedEventIds, eventId];
  }

  function fileType(value: File) {
    const extension = value.name.split('.').pop()?.toLowerCase() || '';
    return extension === 'jpeg' ? 'jpg' : extension;
  }

  async function save() {
    if (!canReview || stage === 'saving') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) return;
    stage = 'saving';
    errorMessage = '';
    requestId = '';
    try {
      const documentId = record?.id
        || `document-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
      const uploadedAt = record?.uploadedAt || new Date().toISOString();
      const uploadedBy = record?.uploadedBy || $userStore?.email || $userStore?.uid || 'operations-portal';
      let storagePath = record?.storagePath || '';
      if (!record && file) {
        const upload = await backendClient.uploadDocumentAsset(
          tenantId,
          documentId,
          file,
          `${operationKey}:upload`,
        );
        storagePath = upload.storagePath;
      }
      const data: CrmDocumentInput = {
        title: title.trim(),
        downloadUrl: backendClient.managedDocumentDownloadUrl(documentId),
        storagePath,
        isAvailable,
        eventId: linkedEventIds[0] || null,
        linkedEventIds,
        availabilityScope,
        category: category.trim(),
        uploadedAt,
        uploadedBy,
        fileType: record?.fileType || fileType(file!),
      };
      if (record) {
        await backendClient.updateDocument(tenantId, documentId, data, auditReason.trim(), operationKey);
      } else {
        await backendClient.createDocument(tenantId, documentId, data, auditReason.trim(), `${operationKey}:create`);
      }
      dispatch('saved');
    } catch (error) {
      stage = 'error';
      errorMessage = error instanceof BackendApiError
        ? error.message
        : 'The document could not be saved.';
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    }
  }
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="document-editor-title">
  <div class="flex min-h-full items-center justify-center p-4">
    <button type="button" class="fixed inset-0 z-0 h-full w-full bg-slate-950/70" aria-label="Close document editor" disabled={stage === 'saving'} on:click={() => dispatch('close')}></button>
    <div class="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" tabindex="-1" use:modalFocus={{ onEscape: () => stage !== 'saving' && dispatch('close'), initialFocusSelector: 'input' }}>
      <h3 id="document-editor-title" class="text-lg font-semibold text-gray-900">{record ? 'Edit document' : 'Upload document'}</h3>
      <p class="mt-1 text-sm text-gray-600">Set the library metadata and audience, then review the complete change before it is saved.</p>

      {#if stage === 'review' || stage === 'saving' || stage === 'error'}
        <div class="mt-5 space-y-4">
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
            <p><strong>Title:</strong> {record?.title || 'New document'} → {title.trim()}</p>
            <p><strong>Category:</strong> {record?.category || 'None'} → {category.trim()}</p>
            <p><strong>Audience:</strong> {record?.availabilityScope || 'None'} → {availabilityScope}</p>
            <p><strong>Availability:</strong> {record?.isAvailable ? 'Available' : 'Unavailable'} → {isAvailable ? 'Available' : 'Unavailable'}</p>
            <p><strong>Linked events:</strong> {selectedEvents.length ? selectedEvents.map((event) => event.title).join(', ') : 'None'}</p>
            {#if file}<p><strong>File:</strong> {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>{/if}
            <p><strong>Audit reason:</strong> {auditReason.trim()}</p>
          </div>
          {#if stage === 'error'}
            <div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {errorMessage} Retry will use the same operation key.
              {#if requestId}<p class="mt-1">Support reference: {requestId}</p>{/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          {#if !record}
            <label class="sm:col-span-2 text-sm font-medium text-gray-700">File
              <input class="mt-1 block w-full rounded-md border border-gray-300 p-2" type="file" accept={allowedTypes} on:change={(event) => file = (event.currentTarget as HTMLInputElement).files?.[0] || null} />
              <span class="crm-ui-hint">PDF, Office, text, PNG, JPEG, GIF, WebP, or HEIC; under 25 MB.</span>
            </label>
          {/if}
          <label class="text-sm font-medium text-gray-700">Title
            <input class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={title} maxlength="200" />
          </label>
          <label class="text-sm font-medium text-gray-700">Category
            <input class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={category} maxlength="80" />
          </label>
          <label class="text-sm font-medium text-gray-700">Audience
            <select class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={availabilityScope}>
              <option value="organization">Entire organization</option>
              <option value="selected_live_events">Selected live events</option>
              <option value="saved_for_later">Saved for later</option>
            </select>
          </label>
          <label class="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input type="checkbox" bind:checked={isAvailable} /> Available to the selected audience
          </label>
          {#if availabilityScope === 'selected_live_events'}
            <fieldset class="sm:col-span-2 rounded-md border border-gray-200 p-3">
              <legend class="px-1 text-sm font-medium text-gray-700">Linked events</legend>
              {#if events.length === 0}<p class="text-sm text-amber-700">No events are available; choose another audience.</p>{/if}
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                {#each events as event (event.id)}
                  <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={linkedEventIds.includes(event.id)} on:change={() => toggleEvent(event.id)} /> {event.title}</label>
                {/each}
              </div>
            </fieldset>
          {/if}
          <label class="sm:col-span-2 text-sm font-medium text-gray-700">Audit reason
            <textarea class="mt-1 block w-full rounded-md border border-gray-300 p-2" bind:value={auditReason} rows="2" maxlength="300" placeholder="Why is this document being added or changed?"></textarea>
            <span class="crm-ui-hint">At least 8 characters.</span>
          </label>
          {#if record && !record.storagePath}
            <p class="sm:col-span-2 text-sm text-amber-700" role="alert">This legacy record cannot be edited until its approved storage object is repaired.</p>
          {/if}
        </div>
      {/if}

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm" disabled={stage === 'saving'} on:click={() => stage === 'edit' ? dispatch('close') : stage = 'edit'}>{stage === 'edit' ? 'Cancel' : 'Back'}</button>
        {#if stage === 'edit'}
          <button type="button" class="crm-ui-primary-button" disabled={!canReview} on:click={() => stage = 'review'}>Review change</button>
        {:else}
          <button type="button" class="crm-ui-primary-button" disabled={stage === 'saving'} on:click={save}>{stage === 'saving' ? 'Saving…' : stage === 'error' ? 'Retry save' : record ? 'Save changes' : 'Upload and publish'}</button>
        {/if}
      </div>
    </div>
  </div>
</div>
