<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let season: any = null;

  const dispatch = createEventDispatcher();
  const supportedStatuses = ['active', 'upcoming', 'completed', 'archived'];

  let name = season ? season.name || season.title || '' : '';
  let status = supportedStatuses.includes(
    String(season?.status || '').trim().toLowerCase(),
  )
    ? String(season.status).trim().toLowerCase()
    : '';
  let imageUrl = season ? season.imageUrl || '' : '';
  let imageFile: File | null = null;
  let imageValidationMessage = '';
  let description = season ? season.description || '' : '';

  let startDate = season && season.startDate ? new Date(season.startDate.toMillis ? season.startDate.toMillis() : season.startDate).toISOString().slice(0, 10) : '';
  let endDate = season && season.endDate ? new Date(season.endDate.toMillis ? season.endDate.toMillis() : season.endDate).toISOString().slice(0, 10) : '';

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  const auditReason = 'Season updated from CRM.';
  let operationKey = createIdempotencyKey('season-update');
  let payloadSignature = '';
  let operationGeneration = 0;

  function buildPayloadSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      seasonId: String(season?.id || '').trim(),
      name: name.trim(),
      status,
      imageUrl: imageUrl.trim(),
      imageFile: imageFile
        ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
        : null,
      description: description.trim(),
      startDate,
      endDate,
      auditReason: auditReason.trim(),
    });
  }

  $: {
    $tenantIdStore;
    season;
    name;
    status;
    imageUrl;
    imageFile;
    description;
    startDate;
    endDate;
    const signature = buildPayloadSignature();
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('season-update');
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    } else if (signature !== payloadSignature && submitState === 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('season-update');
      operationGeneration += 1;
      submitState = 'error';
      errorMessage =
        'The organization or season details changed while saving. Review the form and try again.';
    }
  }

  async function handleSave() {
    if (
      submitState === 'loading'
      || submitState === 'success'
      || !name.trim()
    ) return;
    const seasonId = String(season?.id || '').trim();
    if (!seasonId) {
      errorMessage =
        'This season record is missing its identifier and cannot be updated.';
      return;
    }
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization before updating a season.';
      return;
    }
    if (!supportedStatuses.includes(status)) {
      errorMessage = 'Select a supported season status.';
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      errorMessage = 'Season end date cannot be before its start date.';
      return;
    }
    imageValidationMessage = validateImageFile(imageFile);
    if (imageValidationMessage) {
      return;
    }
    if (imageFile) {
      errorMessage =
        'Season banner upload is temporarily unavailable while publication privacy is being finalized. Remove the image to save other season changes safely.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = buildPayloadSignature();
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      operationKey = createIdempotencyKey('season-update');
    }
    const idempotencyKey = operationKey;

    submitState = 'loading';
    errorMessage = '';

    try {
      await backendClient.updateSeason(tenantId, seasonId, {
        name: name.trim(),
        status,
        description: description.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
      }, auditReason.trim(), idempotencyKey);
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      submitState = 'success';
      dispatch('success');
      dispatch('close');
    } catch (error) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId =
        error instanceof BackendApiError ? error.requestId : null;
      console.error('Season update failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = 'The season could not be updated.';
      submitState = 'error';
    }
  }

  function handleClose() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('close');
  }

  onDestroy(() => {
    operationGeneration += 1;
  });
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel season editing" tabindex="-1" on:click={handleClose}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-xl text-left overflow-y-auto shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full p-6 max-h-[calc(100vh-2rem)]" tabindex="-1" use:modalFocus={{ onEscape: handleClose }}>
      <div class="flex justify-between items-center pb-3 border-b border-gray-200">
        <h3 class="crm-ui-title" id="modal-title">Edit Season</h3>
        <button type="button" disabled={submitState === 'loading'} aria-label="Close season editor" on:click={handleClose} class="text-gray-400 hover:text-gray-600 p-1 rounded-md">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <fieldset disabled={submitState === 'loading'} class="m-0 mt-4 min-w-0 space-y-4 border-0 p-0">
        <ImageFilePicker
          inputId="season-edit-image"
          label="Season Banner Graphic"
          currentUrl={imageUrl}
          previewAlt="Season banner"
          bind:selectedFile={imageFile}
          bind:validationMessage={imageValidationMessage}
          disabled={submitState === 'loading'}
        />

        <!-- Name -->
        <div>
          <label for="season-edit-name" class="crm-ui-label-caps">Season Name *</label>
          <input id="season-edit-name" type="text" bind:value={name} maxlength="160" class="crm-ui-input-primary" placeholder="e.g. Fall 2026 Season" />
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="season-edit-start" class="crm-ui-label-caps">Start Date</label>
            <input id="season-edit-start" type="date" bind:value={startDate} class="crm-ui-input-primary" />
          </div>
          <div>
            <label for="season-edit-end" class="crm-ui-label-caps">End Date</label>
            <input id="season-edit-end" type="date" bind:value={endDate} class="crm-ui-input-primary" />
          </div>
        </div>

        <div>
          <label for="season-edit-status" class="crm-ui-label-caps">Status</label>
          <select id="season-edit-status" bind:value={status} class="crm-ui-input-primary">
            <option value="">Select status</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {#if errorMessage}
          <p class="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
        {/if}

        <!-- Description -->
        <div>
          <label for="season-edit-description" class="crm-ui-label-caps">Description / Notes</label>
          <textarea id="season-edit-description" bind:value={description} maxlength="3000" rows="2" class="crm-ui-input-primary" placeholder="Additional details about this season..."></textarea>
        </div>
      </fieldset>

      <div class="mt-6 flex justify-end space-x-3 pt-3 border-t border-gray-100">
        <button type="button" disabled={submitState === 'loading'} on:click={handleClose} class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <StatusButton
          type="button"
          state={submitState}
          on:click={handleSave}
          disabled={!name.trim() || !status || (startDate && endDate && endDate < startDate) || submitState === 'loading'}
          idleText="Save Changes"
          loadingText="Saving..."
          successText="Saved!"
          errorText="Retry Season Update"
          class="px-4 py-2 bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)] rounded-md text-sm font-semibold hover:bg-[var(--crm-brand-primary-hover)] disabled:opacity-50 shadow-xs"
        />
      </div>
    </div>
  </div>
</div>
