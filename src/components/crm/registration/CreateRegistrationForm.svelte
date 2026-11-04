<script lang="ts">
  import './registration.css';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { notifyRegistrationFormsChanged } from '../../../lib/registration/registrationFormChanges';
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import { teamsStore } from '../../../lib/services/DataStore';
  import { previouslyUsedAgeGroups, registrationPresets } from '../../../lib/registration/guidedFormBuilder';
  import RegistrationFormDesigner from './RegistrationFormDesigner.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import {
    legacyFlagsFromSections,
    registrationSectionsFromForm,
    validateRegistrationSections,
    type RegistrationFormSection,
  } from '../../../lib/registration/registrationFormBuilder';

  const dispatch = createEventDispatcher();

  export let form: any = null;
  export let previewEvent: { title: string; date: string; price: string; imageUrl?: string } | null = null;

  let title = form ? form.title || form.name : '';
  let description = form ? form.description || '' : '';
  let sections: RegistrationFormSection[] = form ? registrationSectionsFromForm(form) : registrationPresets().slice(0, 2).map(section => ({ ...section, fields: section.fields.filter(field => field.id !== 'age_group') }));
  let ageGroups: string[] = [];
  let historyError = '';
  let historyTenant = '';
  let stopHistory = () => {};
  let historicalForms: any[] = [];
  $: if (($tenantIdStore || '') !== historyTenant) {
    historyTenant = $tenantIdStore || '';
    stopHistory(); historicalForms = []; historyError = '';
    if (historyTenant) {
      const tenant = historyTenant;
      stopHistory = RegistrationService.subscribeToForms(tenant, forms => {
        if (tenant !== historyTenant) return;
        historicalForms = forms; historyError = '';
      }, () => { if (tenant === historyTenant) historyError = 'Previous age groups could not be loaded.'; });
    }
  }
  $: ageGroups = previouslyUsedAgeGroups(historicalForms, $teamsStore.filter(team => !team.tenantId || team.tenantId === $tenantIdStore));
  onDestroy(() => stopHistory());

  let currentStep = 1;
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let successMessage = '';
  const auditReason = form?.id
    ? 'Registration form updated from CRM.'
    : 'Registration form created from CRM.';
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
      sections,
      existingStatus,
      auditReason: auditReason.trim(),
    });
  }

  $: {
    $tenantIdStore;
    title;
    description;
    sections;
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

  async function handleSubmit() {
    if (
      submitState === 'loading'
      || submitState === 'success'
      || !title.trim()
      || !existingStatus
    ) return;
    const builderError = validateRegistrationSections(sections);
    if (builderError) {
      errorMessage = builderError;
      return;
    }
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
      const data: any = {
        title: title.trim(),
        description: description.trim(),
        fields: legacyFlagsFromSections(sections),
        sections,
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
        notifyRegistrationFormsChanged(tenantId);
        dispatch('success', { id: response.id, ...data });
        return;
      }
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      successMessage = 'Saved successfully!';
      submitState = 'success';
      notifyRegistrationFormsChanged(tenantId);
      dispatch('success', { id: form.id, ...data });
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
      errorMessage = 'The registration form could not be saved.';
      submitState = 'error';
    }
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }
</script>

<div class="crm-ui-modal-root crm-registration-designer" aria-labelledby="registration-designer-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel registration form" tabindex="-1" on:click={handleCancel}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="crm-ui-modal-panel-lg registration-designer-panel" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <h2 id="registration-designer-title" class="sr-only">{form ? 'Edit registration form' : 'Create registration form'}</h2>
      {#if errorMessage}<p class="save-error" role="alert">{errorMessage}</p>{/if}
      {#if form && !existingStatus}<p class="save-error" role="alert">This form has an unsupported lifecycle status. Saving is disabled to avoid reopening or retiring it accidentally.</p>{/if}
      {#if form}<p class="shared-form-note">Changes apply to new registrations. Saved responses stay unchanged.</p>{/if}
      <fieldset disabled={submitState === 'loading' || submitState === 'success'} class="designer-fieldset">
        <RegistrationFormDesigner bind:title bind:description bind:sections bind:step={currentStep} {ageGroups} {historyError} {previewEvent} disabled={submitState === 'loading'} on:cancel={handleCancel}>
          <StatusButton slot="save" state={submitState} disabled={!existingStatus || submitState === 'loading' || submitState === 'success'} on:click={handleSubmit} idleText="Save form" loadingText="Saving…" successText="Saved" errorText="Retry save" class="crm-ui-button-primary registration-save" />
        </RegistrationFormDesigner>
      </fieldset>
    </div>
  </div>
</div>
<style>
  .registration-designer-panel{width:min(100%,480px);padding:20px 16px;max-height:calc(100dvh - 24px);border-radius:16px}
  .designer-fieldset{border:0;padding:0;margin:0;min-width:0}
  .save-error{color:#b42318;font-size:14px;margin:0 0 14px}.shared-form-note{font-size:12px;color:#607087;margin:0 0 12px}

</style>
