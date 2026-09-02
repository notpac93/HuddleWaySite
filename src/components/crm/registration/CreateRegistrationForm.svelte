<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import {
    legacyFlagsFromSections,
    nextBuilderId,
    registrationSectionsFromForm,
    validateRegistrationSections,
    type RegistrationFieldType,
    type RegistrationFormSection,
  } from '../../../lib/registration/registrationFormBuilder';

  const dispatch = createEventDispatcher();

  export let form: any = null;

  // Step 1: Basics
  let title = form ? form.title || form.name : '';
  let description = form ? form.description || '' : '';

  let sections: RegistrationFormSection[] = registrationSectionsFromForm(form);
  let newStepName = '';
  let previewOpen = false;
  let collapsedSections = new Set<string>();

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

  function touchSections() {
    sections = [...sections];
  }

  function addSection() {
    if (!newStepName.trim()) return;
    const sectionId = nextBuilderId('section', sections);
    const fieldId = nextBuilderId('field', sections);
    sections = [...sections, {
      id: sectionId,
      title: newStepName.trim(),
      description: '',
      isActive: true,
      fields: [{
        id: fieldId,
        type: 'text',
        label: 'New Question',
        required: false,
        placeholder: null,
        options: null,
        isActive: true,
      }],
    }];
    newStepName = '';
  }

  function toggleSection(sectionId: string) {
    const next = new Set(collapsedSections);
    if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
    collapsedSections = next;
  }

  function moveSectionTo(index: number, destination: number) {
    if (destination < 0 || destination >= sections.length || destination === index) return;
    const next = [...sections];
    const [section] = next.splice(index, 1);
    next.splice(destination, 0, section);
    sections = next;
  }

  function removeSection(index: number) {
    if (sections[index]?.fields.some((entry) => entry.id === 'player_name')) return;
    sections = sections.filter((_, entryIndex) => entryIndex !== index);
  }

  function moveSection(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= sections.length) return;
    const next = [...sections];
    [next[index], next[destination]] = [next[destination], next[index]];
    sections = next;
  }

  function addField(sectionIndex: number) {
    const id = nextBuilderId('field', sections);
    const next = [...sections];
    next[sectionIndex] = {
      ...next[sectionIndex],
      fields: [...next[sectionIndex].fields, {
        id,
        type: 'text',
        label: 'New Question',
        required: false,
        placeholder: null,
        options: null,
        isActive: true,
      }],
    };
    sections = next;
  }

  function addQuestionTemplate(sectionIndex: number, template: 'email' | 'phone' | 'emergency') {
    const presets = {
      email: { type: 'email' as RegistrationFieldType, label: 'Email address', placeholder: 'name@example.com' },
      phone: { type: 'phone' as RegistrationFieldType, label: 'Phone number', placeholder: '(555) 555-0123' },
      emergency: { type: 'text' as RegistrationFieldType, label: 'Emergency contact name', placeholder: 'Full name' },
    };
    const preset = presets[template];
    const id = nextBuilderId('field', sections);
    const next = [...sections];
    next[sectionIndex] = { ...next[sectionIndex], fields: [...next[sectionIndex].fields, { id, type: preset.type, label: preset.label, required: false, placeholder: preset.placeholder, options: null, isActive: true }] };
    sections = next;
  }

  function fieldPreview(field: RegistrationFormSection['fields'][number]) {
    if (field.type === 'dropdown') return `Choice list: ${(field.options || []).join(', ') || 'add at least one option'}`;
    if (field.type === 'yes_no') return 'Yes / No choice';
    if (field.type === 'date') return 'Date picker';
    return field.placeholder || `${field.type} response`;
  }

  function removeField(sectionIndex: number, fieldIndex: number) {
    const target = sections[sectionIndex]?.fields[fieldIndex];
    if (!target || target.id === 'player_name') return;
    const next = [...sections];
    next[sectionIndex] = {
      ...next[sectionIndex],
      fields: next[sectionIndex].fields.filter((_, index) => index !== fieldIndex),
    };
    sections = next;
  }

  function moveField(sectionIndex: number, fieldIndex: number, direction: -1 | 1) {
    const fields = [...sections[sectionIndex].fields];
    const destination = fieldIndex + direction;
    if (destination < 0 || destination >= fields.length) return;
    [fields[fieldIndex], fields[destination]] = [fields[destination], fields[fieldIndex]];
    const next = [...sections];
    next[sectionIndex] = { ...next[sectionIndex], fields };
    sections = next;
  }

  function changeFieldType(sectionIndex: number, fieldIndex: number, type: RegistrationFieldType) {
    const field = sections[sectionIndex].fields[fieldIndex];
    field.type = type;
    field.options = type === 'dropdown'
      ? field.options?.length ? field.options : ['Option 1', 'Option 2']
      : null;
    touchSections();
  }

  function changeOptions(sectionIndex: number, fieldIndex: number, value: string) {
    sections[sectionIndex].fields[fieldIndex].options = value
      .split('\n')
      .map((option) => option.trim())
      .filter(Boolean);
    touchSections();
  }

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
              <div class="flex items-center text-sm font-medium {currentStep === 1 ? 'text-[var(--crm-brand-link)]' : 'text-gray-500'}">
                <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 {currentStep === 1 ? 'border-[var(--crm-brand-border)]' : 'border-gray-300'} mr-2">1</span>
                Basics
              </div>
              <div class="mx-4 h-px w-8 bg-gray-300"></div>
              <div class="flex items-center text-sm font-medium {currentStep === 2 ? 'text-[var(--crm-brand-link)]' : 'text-gray-500'}">
                <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 {currentStep === 2 ? 'border-[var(--crm-brand-border)]' : 'border-gray-300'} mr-2">2</span>
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

          {#if form && !existingStatus}
            <div class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              This form has an unsupported lifecycle status. Saving is disabled to avoid reopening or retiring it accidentally.
            </div>
          {/if}
          {#if form}
            <div class="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Changes apply to every connected future event using this form. Existing submitted responses remain readable under their original question labels.</div>
          {:else}
            <div class="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"><strong>Default participant template:</strong> {sections.length} steps and {sections.reduce((count, section) => count + section.fields.length, 0)} questions, including the required player identity fields. Review and customize it before saving.</div>
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
            <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div class="flex flex-wrap items-end justify-between gap-3">
                <p class="text-sm text-gray-500">Each step appears in this order for future registrations.</p>
                <div class="flex gap-2"><label><span class="sr-only">New step name</span><input class="crm-ui-input-teal-wide" bind:value={newStepName} placeholder="New step name" /></label><button type="button" class="crm-ui-registration-secondary whitespace-nowrap" disabled={!newStepName.trim()} on:click={addSection}>Add Step</button><button type="button" class="crm-ui-registration-secondary whitespace-nowrap" on:click={() => previewOpen = !previewOpen}>{previewOpen ? 'Close preview' : 'Preview form'}</button></div>
              </div>

              {#if previewOpen}<section class="rounded-lg border border-blue-200 bg-blue-50 p-4" aria-label="Registration form preview"><h4 class="font-semibold text-blue-950">Family response preview</h4>{#each sections as section, previewIndex}<div class="mt-3"><p class="text-sm font-semibold">{previewIndex + 1}. {section.title}</p><ul class="mt-1 space-y-1">{#each section.fields as field}<li class="text-xs text-blue-900">{field.label}{field.required ? ' *' : ''} — {fieldPreview(field)}</li>{/each}</ul></div>{/each}</section>{/if}

              {#each sections as section, sectionIndex (section.id)}
                <section class="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-label={`Registration step ${sectionIndex + 1}`}>
                  <div class="mb-4 flex items-start gap-3">
                    <span class="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--crm-brand-control)] text-sm font-bold text-[var(--crm-on-primary)]">{sectionIndex + 1}</span>
                    <div class="min-w-0 flex-1 space-y-2">
                      <label>
                        <span class="sr-only">Step {sectionIndex + 1} name</span>
                        <input class="crm-ui-input-teal-wide font-semibold" bind:value={section.title} on:input={touchSections} maxlength="120" placeholder="Step name">
                      </label>
                      <label>
                        <span class="sr-only">Step {sectionIndex + 1} description</span>
                        <input class="crm-ui-input-teal-wide" bind:value={section.description} on:input={touchSections} maxlength="500" placeholder="Optional instructions">
                      </label>
                    </div>
                    <div class="flex gap-1">
                      <button type="button" class="crm-ui-registration-secondary" aria-expanded={!collapsedSections.has(section.id)} on:click={() => toggleSection(section.id)}>{collapsedSections.has(section.id) ? 'Expand' : 'Collapse'}</button>
                      <button type="button" class="crm-ui-registration-secondary" aria-label={`Move ${section.title} up`} disabled={sectionIndex === 0} on:click={() => moveSection(sectionIndex, -1)}>↑</button>
                      <button type="button" class="crm-ui-registration-secondary" aria-label={`Move ${section.title} down`} disabled={sectionIndex === sections.length - 1} on:click={() => moveSection(sectionIndex, 1)}>↓</button>
                      <label><span class="sr-only">Move {section.title} to position</span><select class="crm-ui-registration-secondary" value={sectionIndex} on:change={(event) => moveSectionTo(sectionIndex, Number(event.currentTarget.value))}>{#each sections as _, position}<option value={position}>{position + 1}</option>{/each}</select></label>
                      <button
                        type="button"
                        class="crm-ui-registration-secondary text-red-700"
                        aria-label={`Remove ${section.title}`}
                        title={section.fields.some((entry) => entry.id === 'player_name') ? 'The step containing Player Name is required.' : undefined}
                        disabled={section.fields.some((entry) => entry.id === 'player_name')}
                        on:click={() => removeSection(sectionIndex)}
                      >Remove</button>
                    </div>
                  </div>

                  {#if !collapsedSections.has(section.id)}<div class="space-y-3">
                    {#each section.fields as formField, fieldIndex (formField.id)}
                      <div class="rounded-md border border-gray-200 bg-white p-3">
                        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_auto]">
                          <label>
                            <span class="crm-ui-label">Question</span>
                            <input class="crm-ui-input-teal-wide" bind:value={formField.label} on:input={touchSections} maxlength="120">
                          </label>
                          <label>
                            <span class="crm-ui-label">Type</span>
                            <select class="crm-ui-input-teal-wide" value={formField.type} on:change={(event) => changeFieldType(sectionIndex, fieldIndex, event.currentTarget.value as RegistrationFieldType)}>
                              <option value="text">Text</option>
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                              <option value="date">Date</option>
                              <option value="dropdown">Dropdown</option>
                              <option value="yes_no">Yes / No</option>
                            </select>
                          </label>
                          <div class="flex items-end gap-1">
                            <button type="button" class="crm-ui-registration-secondary" aria-label={`Move ${formField.label} up`} disabled={fieldIndex === 0} on:click={() => moveField(sectionIndex, fieldIndex, -1)}>↑</button>
                            <button type="button" class="crm-ui-registration-secondary" aria-label={`Move ${formField.label} down`} disabled={fieldIndex === section.fields.length - 1} on:click={() => moveField(sectionIndex, fieldIndex, 1)}>↓</button>
                            <button
                              type="button"
                              class="crm-ui-registration-secondary text-red-700"
                              aria-label={`Remove ${formField.label}`}
                              title={formField.id === 'player_name' ? 'Player Name is required for roster records.' : undefined}
                              disabled={formField.id === 'player_name'}
                              on:click={() => removeField(sectionIndex, fieldIndex)}
                            >Remove</button>
                          </div>
                        </div>
                        <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <label>
                            <span class="crm-ui-label">Placeholder</span>
                            <input class="crm-ui-input-teal-wide" value={formField.placeholder || ''} on:input={(event) => { formField.placeholder = event.currentTarget.value || null; touchSections(); }} maxlength="200" placeholder="Optional helper text">
                          </label>
                          <label class="flex items-end gap-2 pb-2 text-sm font-medium text-gray-700">
                            <input type="checkbox" class="crm-ui-checkbox" bind:checked={formField.required} on:change={touchSections} disabled={formField.id === 'player_name'}>
                            Required
                          </label>
                        </div>
                        {#if formField.type === 'dropdown'}
                          <label class="mt-3 block">
                            <span class="crm-ui-label">Options — one per line</span>
                            <textarea class="crm-ui-input-teal-wide" rows="3" value={(formField.options || []).join('\n')} on:input={(event) => changeOptions(sectionIndex, fieldIndex, event.currentTarget.value)}></textarea>
                          </label>
                        {/if}
                        <p class="mt-2 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600"><strong>Response preview:</strong> {fieldPreview(formField)}</p>
                      </div>
                    {/each}
                    <div class="flex flex-wrap gap-2"><button type="button" class="crm-ui-registration-secondary" on:click={() => addField(sectionIndex)}>Add Question</button><button type="button" class="crm-ui-registration-secondary" on:click={() => addQuestionTemplate(sectionIndex, 'email')}>Add email question</button><button type="button" class="crm-ui-registration-secondary" on:click={() => addQuestionTemplate(sectionIndex, 'phone')}>Add phone question</button><button type="button" class="crm-ui-registration-secondary" on:click={() => addQuestionTemplate(sectionIndex, 'emergency')}>Add emergency contact</button></div>
                  </div>{/if}
                </section>
              {/each}
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
                disabled={!existingStatus || submitState === 'loading'}
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
