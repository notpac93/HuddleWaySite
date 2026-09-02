<script lang="ts">
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import {
    legacyFlagsFromSections,
    registrationSectionsFromForm,
    validateRegistrationSections,
  } from '../../../lib/registration/registrationFormBuilder';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';

  export let tenantId = '';
  export let form: any;
  export let connectedEvents: any[] = [];
  export let targetStatus: 'active' | 'archived';
  export let onCancel: () => void = () => {};
  export let onSuccess: (updated: any) => void = () => {};

  let auditReason = '';
  let confirmed = false;
  let state: 'idle' | 'loading' | 'error' = 'idle';
  let errorMessage = '';
  let requestId = '';
  let idempotencyKey = createIdempotencyKey('registration-form-lifecycle');

  $: isRetiring = targetStatus === 'archived';
  $: sections = registrationSectionsFromForm(form);
  $: compatibilityError = validateRegistrationSections(sections);
  $: actionLabel = isRetiring ? 'Retire form' : 'Reactivate form';
  $: impactLabel = connectedEvents.length === 1
    ? '1 connected event'
    : `${connectedEvents.length} connected events`;

  async function submit() {
    if (
      state === 'loading'
      || !tenantId
      || !form?.id
      || !auditReason.trim()
      || !confirmed
      || compatibilityError
    ) return;
    state = 'loading';
    errorMessage = '';
    requestId = '';
    const data = {
      title: String(form.title || form.name || '').trim(),
      description: String(form.description || '').trim(),
      fields: legacyFlagsFromSections(sections),
      sections,
      status: targetStatus,
    };
    try {
      await backendClient.updateRegistrationForm(
        tenantId,
        form.id,
        data,
        auditReason.trim(),
        idempotencyKey,
      );
      onSuccess({
        ...form,
        ...data,
        name: data.title,
        rawStatus: targetStatus,
        status: targetStatus === 'archived' ? 'Closed' : 'Open',
      });
    } catch (error) {
      state = 'error';
      errorMessage = `The form could not be ${isRetiring ? 'retired' : 'reactivated'}. No lifecycle change was applied.`;
      requestId = error instanceof BackendApiError ? error.requestId || '' : '';
    }
  }
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="registration-lifecycle-title">
  <button type="button" class="crm-ui-backdrop" aria-label={`Cancel ${actionLabel.toLowerCase()}`} tabindex="-1" disabled={state === 'loading'} on:click={onCancel}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6">
      <h2 id="registration-lifecycle-title" class="text-xl font-semibold text-gray-950">{actionLabel}: {form.name || form.title}</h2>
      <p class="mt-1 text-sm text-gray-600">Review the event impact and historical-data behavior before changing availability.</p>
    </header>
    <div class="space-y-5 p-6">
      {#if compatibilityError}
        <p class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">This form cannot be reactivated safely: {compatibilityError}</p>
      {:else}
        <section class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <h3 class="font-semibold text-gray-950">Connected-event impact</h3>
          <p class="mt-1"><strong>{impactLabel}</strong> currently reference this form.</p>
          {#if connectedEvents.length}
            <ul class="mt-2 list-disc space-y-1 pl-5">
              {#each connectedEvents.slice(0, 5) as event}<li>{event.title || event.name || event.id}</li>{/each}
            </ul>
          {/if}
          <p class="mt-3">{isRetiring
            ? 'Historical responses stay readable. New registration starts must use another active form; connected events should be reviewed immediately.'
            : 'Historical responses remain unchanged. The form becomes available for new or existing event connections after this change.'}</p>
        </section>
        <label class="block text-sm font-medium text-gray-800">Reason for lifecycle change <span class="text-red-600">*</span><textarea rows="3" bind:value={auditReason} maxlength="500" disabled={state === 'loading'} class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"></textarea></label>
        <label class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" bind:checked={confirmed} disabled={state === 'loading'} class="mt-0.5 h-4 w-4 rounded border-gray-300" /><span>I confirm the target form, {impactLabel}, and {isRetiring ? 'new-registration interruption' : 'reactivation'} impact are correct.</span></label>
      {/if}
      {#if errorMessage}<p class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{errorMessage}{#if requestId} Support reference: {requestId}.{/if}</p>{/if}
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
      <button type="button" class="crm-ui-button-secondary" disabled={state === 'loading'} on:click={onCancel}>Cancel</button>
      <button type="button" class={isRetiring ? 'crm-ui-button-danger inline-flex items-center gap-2' : 'crm-ui-button-primary inline-flex items-center gap-2'} disabled={state === 'loading' || Boolean(compatibilityError) || !auditReason.trim() || !confirmed} on:click={submit}><Icon name={isRetiring ? 'archive' : 'check'} size={16} /> {state === 'loading' ? 'Applying…' : actionLabel}</button>
    </footer>
  </div>
</div>
