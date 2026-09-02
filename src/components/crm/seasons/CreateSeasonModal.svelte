<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import CreateRegistrationForm from '../registration/CreateRegistrationForm.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let activeTeam: any = null;

  const dispatch = createEventDispatcher();
  const supportedStatuses = ['active', 'upcoming', 'completed', 'archived'];

  let name = '';
  let startDate = '';
  let endDate = '';
  let status = 'active';
  let imageFile: File | null = null;
  let imageValidationMessage = '';
  let registrationForms: any[] = [];
  let selectedFormId = '';
  let showCreateForm = false;
  let registrationFormsLoading = false;
  let registrationFormsError = '';
  let loadedRegistrationTenant = '';
  let unsubscribeRegistrationForms = () => {};
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  const auditReason = 'Season created from CRM.';
  let operationKey = createIdempotencyKey('season-create');
  let payloadSignature = '';
  let operationGeneration = 0;

  $: if (($tenantIdStore || '') !== loadedRegistrationTenant) {
    loadedRegistrationTenant = $tenantIdStore || '';
    unsubscribeRegistrationForms();
    unsubscribeRegistrationForms = () => {};
    registrationForms = [];
    selectedFormId = '';
    registrationFormsError = '';
    registrationFormsLoading = Boolean(loadedRegistrationTenant);
    if (loadedRegistrationTenant) {
      const subscribedTenant = loadedRegistrationTenant;
      unsubscribeRegistrationForms = RegistrationService.subscribeToForms(
        subscribedTenant,
        (forms) => {
          if (loadedRegistrationTenant !== subscribedTenant) return;
          registrationForms = forms
            .map((form) => ({
              ...form,
              id: String(form?.id || '').trim(),
              title: String(form?.title || form?.name || 'Form name unavailable'),
            }))
            .filter((form) => Boolean(form.id));
          registrationFormsLoading = false;
        },
        () => {
          if (loadedRegistrationTenant !== subscribedTenant) return;
          console.error('Registration forms could not be loaded.');
          registrationFormsLoading = false;
          registrationFormsError = 'Registration forms could not be loaded.';
        },
      );
    }
  }

  function handleFormSelectionChange() {
    if (selectedFormId === 'CREATE_NEW') {
      selectedFormId = '';
      showCreateForm = true;
    }
  }

  function handleRegistrationCreated(event: CustomEvent) {
    if (event.detail?.id) {
      registrationForms = [...registrationForms, event.detail];
      selectedFormId = event.detail.id;
    }
    showCreateForm = false;
  }

  function buildPayloadSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      teamId: String(activeTeam?.id || '').trim() || null,
      name: name.trim(),
      startDate,
      endDate,
      status,
      imageFile: imageFile
        ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
        : null,
      registrationFormId: selectedFormId || null,
      auditReason: auditReason.trim(),
    });
  }

  $: {
    $tenantIdStore;
    activeTeam;
    name;
    startDate;
    endDate;
    status;
    imageFile;
    selectedFormId;
    const signature = buildPayloadSignature();
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('season-create');
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    } else if (signature !== payloadSignature && submitState === 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('season-create');
      operationGeneration += 1;
      submitState = 'error';
      errorMessage =
        'The organization or season details changed while saving. Review the form and try again.';
    }
  }

  async function handleCreate() {
    if (
      submitState === 'loading'
      || submitState === 'success'
      || !name.trim()
    ) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization before creating a season.';
      return;
    }
    if (!startDate || !endDate) {
      errorMessage = 'Choose a start date and an end date.';
      return;
    }
    if (endDate < startDate) {
      errorMessage = 'Season end date cannot be before its start date.';
      return;
    }
    if (!supportedStatuses.includes(status)) {
      errorMessage = 'Select a supported season status.';
      return;
    }
    imageValidationMessage = validateImageFile(imageFile);
    if (imageValidationMessage) {
      return;
    }
    if (imageFile) {
      errorMessage =
        'Season banner upload is temporarily unavailable while publication privacy is being finalized. Remove the image to save the season safely.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = buildPayloadSignature();
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      operationKey = createIdempotencyKey('season-create');
    }
    const idempotencyKey = operationKey;
    submitState = 'loading';
    errorMessage = '';

    try {
      const response = await backendClient.createSeason(
        tenantId,
        {
          teamId: String(activeTeam?.id || '').trim() || null,
          name: name.trim(),
          startDate,
          endDate,
          status,
          registrationFormId: selectedFormId || null,
        },
        auditReason.trim(),
        idempotencyKey,
      );
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      submitState = 'success';
      dispatch('success', { id: response.id, name: name.trim() });
      dispatch('close');
    } catch (error) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId =
        error instanceof BackendApiError ? error.requestId : null;
      console.error('Season creation failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = 'The season could not be created.';
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
    unsubscribeRegistrationForms();
  });
</script>

<!-- Modal Overlay -->
<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">

    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel season creation" tabindex="-1" on:click={handleClose}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full" tabindex="-1" use:modalFocus={{ onEscape: handleClose }}>

      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] overflow-y-auto">
        <div class="sm:flex sm:items-start">
          <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
            <h3 class="text-xl leading-6 font-semibold text-gray-900" id="modal-title">
              Create New Season
            </h3>

            <fieldset disabled={submitState === 'loading'} class="m-0 mt-6 min-w-0 space-y-4 border-0 p-0">
              <!-- Basic Info -->
              <div>
                <label for="season-create-name" class="crm-ui-label">Season Name</label>
                <input id="season-create-name" type="text" bind:value={name} maxlength="160" class="crm-ui-input-indigo" placeholder="e.g. Fall 2026 Season">
              </div>

              <ImageFilePicker
                inputId="season-create-image"
                label="Season Banner (Optional)"
                bind:selectedFile={imageFile}
                bind:validationMessage={imageValidationMessage}
                disabled={submitState === 'loading'}
              />

              <div class="crm-ui-grid-two">
                <div>
                  <label for="season-create-start" class="crm-ui-label">Start Date</label>
                  <input id="season-create-start" type="date" bind:value={startDate} class="crm-ui-input-indigo">
                </div>
                <div>
                  <label for="season-create-end" class="crm-ui-label">End Date</label>
                  <input id="season-create-end" type="date" bind:value={endDate} class="crm-ui-input-indigo">
                </div>
              </div>

              <!-- Registration Form Select -->
              <div class="mt-6 border-t border-gray-200 pt-4">
                <label for="season-create-registration-form" class="block text-sm font-medium text-gray-700 mb-1">Registration Form</label>
                <p class="text-xs text-gray-500 mb-2">Select a registration form to attach to this season, or create a new one.</p>
                <select id="season-create-registration-form" bind:value={selectedFormId} on:change={handleFormSelectionChange} class="crm-ui-input-indigo">
                  <option value="">-- No Registration Needed --</option>
                  {#each registrationForms as form (form.id)}
                    <option value={form.id}>{form.title}</option>
                  {/each}
                  <option value="CREATE_NEW" class="font-bold text-[var(--crm-brand-link)]">+ Create New Form</option>
                </select>
                {#if registrationFormsLoading}
                  <p class="mt-2 text-xs text-gray-600" role="status">Loading registration forms…</p>
                {:else if registrationFormsError}
                  <p class="mt-2 text-xs text-red-700" role="alert">{registrationFormsError}</p>
                {/if}
              </div>

            </fieldset>

            {#if errorMessage}
              <p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
            {/if}

          </div>
        </div>
      </div>
      <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
        <StatusButton
          type="button"
          state={submitState}
          on:click={handleCreate}
          disabled={!name.trim() || !startDate || !endDate || endDate < startDate || submitState === 'loading'}
          idleText="Create Season"
          loadingText="Creating..."
          successText="Created!"
          class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[var(--crm-brand-control)] text-base font-medium text-[var(--crm-on-primary)] hover:bg-[var(--crm-brand-primary-hover)] focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
          disabled={submitState === 'loading'}
          on:click={handleClose}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</div>

{#if showCreateForm}
  <CreateRegistrationForm
    on:success={handleRegistrationCreated}
    on:cancel={() => showCreateForm = false}
  />
{/if}
