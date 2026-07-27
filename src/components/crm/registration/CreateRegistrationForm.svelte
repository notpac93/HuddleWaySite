<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  const dispatch = createEventDispatcher();

  export let form = null;

  // Step 1: Basics
  let title = form ? form.title || form.name : '';
  let description = form ? form.description || '' : '';

  // Step 2: Information to Collect
  let collectParentNames = form?.fields?.collectParentNames ?? true;
  let collectParentPhone = form?.fields?.collectParentPhone ?? true;
  let collectParentEmail = form?.fields?.collectParentEmail ?? true;
  let collectEmergencyContacts = form?.fields?.collectEmergencyContacts ?? false;

  let collectDob = form?.fields?.collectDob ?? true;
  let collectGender = form?.fields?.collectGender ?? false;
  let collectShirtSize = form?.fields?.collectShirtSize ?? false;
  let collectMedicalInfo = form?.fields?.collectMedicalInfo ?? false;
  let collectExperience = form?.fields?.collectExperience ?? false;

  let collectCoachRequest = form?.fields?.collectCoachRequest ?? false;
  let collectVolunteer = form?.fields?.collectVolunteer ?? false;

  let currentStep = 1;
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let successMessage = '';
  let auditReason = '';
  let idempotencyKey = createIdempotencyKey(
    form?.id ? 'registration-form-update' : 'registration-form-create',
  );
  let payloadSignature = '';
  let operationGeneration = 0;
  const existingStatus =
    form?.rawStatus === 'archived' || form?.rawStatus === 'closed'
      ? 'archived'
      : form?.rawStatus === 'active' || form?.rawStatus === 'open'
        ? 'active'
        : form
          ? null
          : 'active';

  function buildPayloadSignature() {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      formId: form?.id || '',
      title: title.trim(),
      description: description.trim(),
      collectParentNames,
      collectParentPhone,
      collectParentEmail,
      collectEmergencyContacts,
      collectDob,
      collectGender,
      collectShirtSize,
      collectMedicalInfo,
      collectExperience,
      collectCoachRequest,
      collectVolunteer,
      existingStatus,
      auditReason: auditReason.trim(),
    });
  }

  $: {
    $tenantIdStore;
    title;
    description;
    collectParentNames;
    collectParentPhone;
    collectParentEmail;
    collectEmergencyContacts;
    collectDob;
    collectGender;
    collectShirtSize;
    collectMedicalInfo;
    collectExperience;
    collectCoachRequest;
    collectVolunteer;
    auditReason;
    const signature = buildPayloadSignature();
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      idempotencyKey = createIdempotencyKey(
        form?.id ? 'registration-form-update' : 'registration-form-create',
      );
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    } else if (signature !== payloadSignature && submitState === 'loading') {
      payloadSignature = signature;
      idempotencyKey = createIdempotencyKey(
        form?.id ? 'registration-form-update' : 'registration-form-create',
      );
      operationGeneration += 1;
      submitState = 'error';
      errorMessage =
        'The organization or form details changed while saving. Review the form and try again.';
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
  });

  function handleNext() {
    if (currentStep === 1 && title.trim()) {
      currentStep++;
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  async function handleSubmit() {
    if (
      submitState === 'loading'
      || submitState === 'success'
      || !title.trim()
      || auditReason.trim().length < 3
      || !existingStatus
    ) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization before saving a registration form.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = buildPayloadSignature();
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      idempotencyKey = createIdempotencyKey(
        form?.id ? 'registration-form-update' : 'registration-form-create',
      );
    }
    const operationKey = idempotencyKey;

    submitState = 'loading';
    errorMessage = '';
    successMessage = '';
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        fields: {
          collectParentNames,
          collectParentPhone,
          collectParentEmail,
          collectEmergencyContacts,
          collectDob,
          collectGender,
          collectShirtSize,
          collectMedicalInfo,
          collectExperience,
          collectCoachRequest,
          collectVolunteer
        },
        status: existingStatus,
      };

      if (form && form.id) {
        await backendClient.updateRegistrationForm(
          tenantId,
          form.id,
          data,
          auditReason.trim(),
          operationKey,
        );
      } else {
        const response = await backendClient.createRegistrationForm(
          tenantId,
          data,
          auditReason.trim(),
          operationKey,
        );
        if (
          generation !== operationGeneration
          || $tenantIdStore !== tenantId
          || payloadSignature !== submittedSignature
        ) return;
        successMessage = 'Saved successfully!';
        submitState = 'success';
        dispatch('success', { id: response.id, title: data.title });
        return;
      }
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      successMessage = 'Saved successfully!';
      submitState = 'success';
      dispatch('success');
    } catch (e) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId = e instanceof BackendApiError ? e.requestId : null;
      console.error('Registration form save failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = `The registration form could not be saved.${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }

  function handleFormSubmit() {
    if (currentStep === 1) {
      handleNext();
    } else if (currentStep === 2) {
      handleSubmit();
    }
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <button type="button" disabled={submitState === 'loading'} class="fixed inset-0 z-0 h-full w-full bg-gray-500 bg-opacity-75" aria-label="Cancel registration form" tabindex="-1" on:click={handleCancel}></button>

    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="crm-ui-modal-panel-lg" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <form on:submit|preventDefault={handleFormSubmit}>
        <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0">
        <div class="crm-ui-modal-body">

          <div class="mb-5 border-b border-gray-200 pb-4">
            <h3 class="crm-ui-modal-title" id="modal-title">
              {form ? 'Edit Registration Form' : 'Create New Registration Form'}
            </h3>
            <div class="mt-2 flex items-center">
              <div class="flex items-center text-sm font-medium {currentStep === 1 ? 'text-[#00a4bd]' : 'text-gray-500'}">
                <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 {currentStep === 1 ? 'border-[#00a4bd]' : 'border-gray-300'} mr-2">1</span>
                Basics
              </div>
              <div class="mx-4 h-px w-8 bg-gray-300"></div>
              <div class="flex items-center text-sm font-medium {currentStep === 2 ? 'text-[#00a4bd]' : 'text-gray-500'}">
                <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 {currentStep === 2 ? 'border-[#00a4bd]' : 'border-gray-300'} mr-2">2</span>
                Form Builder
              </div>
            </div>
          </div>

          {#if errorMessage}
            <div class="mb-4 bg-red-50 border-l-4 border-red-400 p-4" role="alert">
              <div class="flex">
                <div class="ml-3">
                  <p class="text-sm text-red-700">{errorMessage}</p>
                </div>
              </div>
            </div>
          {/if}

          <div class="crm-ui-notice" role="status">
            These fields configure the CRM registration-form record. Consumer checkout linkage is not verified in this release, so saving is not confirmation that parents will see these options.
          </div>
          {#if form && !existingStatus}
            <div class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              This form has an unsupported lifecycle status. Saving is disabled to avoid reopening or retiring it accidentally.
            </div>
          {/if}

          {#if successMessage}
            <div class="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
              <div class="flex">
                <div class="ml-3">
                  <p class="text-sm text-green-700">{successMessage}</p>
                </div>
              </div>
            </div>
          {/if}

          <div class="mb-4">
            <label for="registration-form-audit-reason" class="crm-ui-label">Reason for change *</label>
            <input id="registration-form-audit-reason" type="text" bind:value={auditReason} minlength="3" maxlength="500" required class="crm-ui-field" placeholder="Why is this form being created or changed?">
          </div>

          {#if currentStep === 1}
            <div class="space-y-4">
              <div>
                <label for="reg-title" class="crm-ui-label">Registration Title *</label>
                <input type="text" id="reg-title" bind:value={title} required class="crm-ui-input-teal-wide" placeholder="e.g. 2026 Fall Season Form">
              </div>

              <div>
                <label for="reg-desc" class="crm-ui-label">Description</label>
                <textarea id="reg-desc" bind:value={description} rows="3" class="crm-ui-input-teal-wide" placeholder="Optional description..."></textarea>
              </div>
            </div>
          {:else if currentStep === 2}
            <div class="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              <p class="text-sm text-gray-500">Configure what information parents must provide when registering.</p>

              <!-- Player Information Section -->
              <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 class="text-sm font-bold text-gray-900 mb-3 border-b border-gray-200 pb-2">Player Information</h4>
                <div class="crm-ui-grid-two">
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectDob} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Date of Birth<span class="block text-xs font-normal text-gray-500">Required for division placement</span></span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectGender} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Gender</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectShirtSize} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Shirt / Uniform Size</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectMedicalInfo} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Medical & Allergies</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectExperience} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Experience Level</span>
                  </label>
                </div>
              </div>

              <!-- Parent Information Section -->
              <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 class="text-sm font-bold text-gray-900 mb-3 border-b border-gray-200 pb-2">Parent / Guardian Information</h4>
                <div class="crm-ui-grid-two">
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectParentNames} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Guardian Names</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectParentPhone} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Phone Numbers</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectParentEmail} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Email Addresses<span class="block text-xs font-normal text-gray-500">Links child to account</span></span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectEmergencyContacts} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Emergency Contacts</span>
                  </label>
                </div>
              </div>

              <!-- Additional Details Section -->
              <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 class="text-sm font-bold text-gray-900 mb-3 border-b border-gray-200 pb-2">Additional Options</h4>
                <div class="crm-ui-grid-two">
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectCoachRequest} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Coach / Teammate Request</span>
                  </label>
                  <label class="crm-ui-start">
                    <input type="checkbox" bind:checked={collectVolunteer} class="crm-ui-checkbox">
                    <span class="crm-ui-checkbox-label">Volunteer Opportunities<span class="block text-xs font-normal text-gray-500">Coach, Team Mom, etc.</span></span>
                  </label>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="bg-gray-50 px-4 py-3 sm:px-6 flex sm:flex-row-reverse justify-between">
          <div class="flex space-x-3 sm:space-x-reverse sm:flex-row-reverse">
            {#if currentStep === 1}
              <button type="button" on:click={handleNext} disabled={!title.trim()} class="crm-ui-registration-primary">
                Next
              </button>
            {:else}
              <StatusButton
                type="submit"
                state={submitState}
                disabled={!existingStatus || auditReason.trim().length < 3 || submitState === 'loading'}
                idleText="Save Form"
                loadingText="Saving..."
                successText="Saved!"
                errorText="Retry Save"
                class="crm-ui-registration-primary"
              />
            {/if}

            <button type="button" disabled={submitState === 'loading'} on:click={handleCancel} class="crm-ui-registration-secondary">
              Cancel
            </button>
          </div>

          {#if currentStep > 1}
            <button type="button" disabled={submitState === 'loading'} on:click={handleBack} class="crm-ui-registration-back">
              Back
            </button>
          {/if}
        </div>
        </fieldset>
      </form>
    </div>
  </div>
</div>
