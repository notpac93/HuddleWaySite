<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
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
  let description = season ? season.description || '' : '';

  let startDate = season && season.startDate ? new Date(season.startDate.toMillis ? season.startDate.toMillis() : season.startDate).toISOString().slice(0, 10) : '';
  let endDate = season && season.endDate ? new Date(season.endDate.toMillis ? season.endDate.toMillis() : season.endDate).toISOString().slice(0, 10) : '';

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let auditReason = '';
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
    description;
    startDate;
    endDate;
    auditReason;
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

  function hasValidImageUrl() {
    if (!imageUrl.trim()) return true;
    try {
      return new URL(imageUrl.trim()).protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function handleSave() {
    if (
      submitState === 'loading'
      || submitState === 'success'
      || !name.trim()
      || auditReason.trim().length < 3
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
    if (!hasValidImageUrl()) {
      errorMessage = 'Season image URL must be a valid HTTPS address.';
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
        imageUrl: imageUrl.trim(),
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
      errorMessage = `The season could not be updated.${supportId ? ` Support request: ${supportId}` : ''}`;
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
        <!-- Image Banner -->
        <div>
          <label for="season-edit-image" class="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">Season Banner Graphic</label>
          <div class="flex items-center space-x-4">
            <div class="w-24 h-20 rounded-lg overflow-hidden border border-gray-300 bg-slate-900 shrink-0">
              {#if imageUrl}
                <img
                  src={imageUrl}
                  alt="Season Banner"
                  width="640"
                  height="288"
                  decoding="async"
                  class="crm-ui-cover"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-xs text-gray-400">No Image</div>
              {/if}
            </div>
            <div class="flex-1 space-y-2">
              <p class="crm-ui-notice-sm">File uploads are unavailable in this release. Retain the current image or use an approved HTTPS image URL.</p>
              <input
                id="season-edit-image"
                type="url"
                bind:value={imageUrl}
                maxlength="2000"
                autocomplete="url"
                placeholder="Or paste image URL..."
                class="w-full text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:ring-[#1855c5] focus:border-[#1855c5]"
              />
            </div>
          </div>
        </div>

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

        <div>
          <label for="season-edit-audit-reason" class="crm-ui-label-caps">Reason for change *</label>
          <input id="season-edit-audit-reason" type="text" bind:value={auditReason} minlength="3" maxlength="500" required class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Why is this season being changed?">
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
          disabled={!name.trim() || !status || (startDate && endDate && endDate < startDate) || auditReason.trim().length < 3 || submitState === 'loading'}
          idleText="Save Changes"
          loadingText="Saving..."
          successText="Saved!"
          errorText="Retry Season Update"
          class="px-4 py-2 bg-[#1855c5] text-white rounded-md text-sm font-semibold hover:bg-[#1546a3] disabled:opacity-50 shadow-xs"
        />
      </div>
    </div>
  </div>
</div>
