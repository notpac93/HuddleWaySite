<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type CrmEventOccurrenceInput } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import EventPaymentTermsEditor from '../billing/EventPaymentTermsEditor.svelte';

  export let event: any = null;
  export let teams: Record<string, string> = {};
  export let seriesSize = 0;
  export let projectionComplete = true;

  const dispatch = createEventDispatcher();

  let title = event ? event.title || '' : '';
  let location = event ? event.location || '' : '';
  let teamId = event ? event.teamId || '' : '';
  let lifecycleStatus = event ? event.lifecycleStatus || 'draft' : 'draft';
  let imageUrl = event ? event.imageUrl || '' : '';
  let imageFile: File | null = null;
  let imageValidationMessage = '';
  let price = (Number(event?.priceCents || 0) / 100).toFixed(2);
  let paymentChoice: 'pay_in_full' | 'installments' = event?.paymentTerms?.mode === 'installments' ? 'installments' : 'pay_in_full';
  let installmentCount = Number(event?.paymentTerms?.installmentCount || 3);
  let installmentCadence: 'weekly' | 'monthly' = event?.paymentTerms?.cadence === 'weekly' ? 'weekly' : 'monthly';
  let cancellationPolicy = String(event?.paymentPolicies?.cancellation?.text || '');
  let refundPolicy = String(event?.paymentPolicies?.refund?.text || '');
  function localDateKey(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }
  let rawDate = event && event.dateObj
    ? localDateKey(new Date(event.dateObj))
    : '';
  let rawTime = event && event.dateObj
    ? new Date(event.dateObj).toTimeString().slice(0, 5)
    : '';
  let rawEndTime = event && event.endDateObj
    ? new Date(event.endDateObj).toTimeString().slice(0, 5)
    : '';
  let applyToSeries = false;
  const auditReason = 'Event updated from CRM.';

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  let operationKey = createIdempotencyKey('event-update');
  let imageUploadKey = createIdempotencyKey('event-cover-upload');
  let payloadSignature = '';
  let currentPayloadSignature = '';
  let operationGeneration = 0;
  const originalLifecycleStatus = lifecycleStatus;
  const validLifecycleStatuses = new Set(['draft', 'published', 'archived']);
  const publishConfirmationText = 'PUBLISH EVENT';
  let publishConfirmation = '';
  $: publishConfirmationRequired =
    lifecycleStatus === 'published'
    && originalLifecycleStatus !== 'published';
  $: if (!publishConfirmationRequired && publishConfirmation) {
    publishConfirmation = '';
  }

  $: currentPayloadSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    eventId: event?.id || '',
    title: title.trim(),
    location: location.trim(),
    teamId,
    lifecycleStatus,
    imageUrl: imageUrl.trim(),
    imageFile: imageFile
      ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
      : null,
    rawDate,
    rawTime,
    rawEndTime,
    applyToSeries,
    auditReason: auditReason.trim(),
    publishConfirmation,
    price,
    paymentChoice,
    installmentCount,
    installmentCadence,
    cancellationPolicy,
    refundPolicy,
  });
  $: {
    const signature = currentPayloadSignature;
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('event-update');
      imageUploadKey = createIdempotencyKey('event-cover-upload');
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    } else if (signature !== payloadSignature) {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('event-update');
      operationGeneration += 1;
      submitState = 'error';
      errorMessage =
        'The organization or event details changed while saving. Review the form and try again.';
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
  });

  function handleClose() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }

  async function handleSave() {
    if (submitState === 'loading' || !event?.id) return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'Select an organization and sign in before editing events.';
      return;
    }
    if (!title.trim() || !teamId || !rawDate || !rawTime || !rawEndTime) {
      errorMessage = 'Event title, team, date, start time, and end time are required.';
      return;
    }
    if (rawEndTime <= rawTime) {
      errorMessage = 'Event end time must be later than its start time.';
      return;
    }
    if (!validLifecycleStatuses.has(lifecycleStatus)) {
      errorMessage = 'Choose a valid event lifecycle status before saving.';
      return;
    }
    imageValidationMessage = validateImageFile(imageFile);
    if (imageValidationMessage) {
      return;
    }
    if (
      applyToSeries
      && (!projectionComplete || seriesSize > 400)
    ) {
      errorMessage = 'Series updates require a complete series of at most 400 events.';
      return;
    }
    if (
      publishConfirmationRequired
      && publishConfirmation !== publishConfirmationText
    ) {
      errorMessage =
        `Type ${publishConfirmationText} before publishing this event.`;
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(price.trim())) {
      errorMessage = 'Enter a valid registration price with no more than two decimal places.';
      return;
    }
    const priceCents = Math.round(Number(price) * 100);
    if (priceCents > 0 && (!cancellationPolicy.trim() || !refundPolicy.trim())) {
      errorMessage = 'Add the cancellation and refund policies families should see.';
      return;
    }
    const eventId = String(event.id);
    const generation = ++operationGeneration;
    const submittedSignature = currentPayloadSignature;
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      operationKey = createIdempotencyKey('event-update');
    }
    const idempotencyKey = operationKey;
    submitState = 'loading';
    errorMessage = '';

    try {
      const uploadedImage = imageFile
        ? await backendClient.uploadImageAsset(
          tenantId,
          imageFile,
          'event-cover',
          imageUploadKey,
        )
        : null;
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(event?.id || '') !== eventId
        || payloadSignature !== submittedSignature
      ) return;
      const update: Parameters<typeof backendClient.updateEvent>[2] = {
        title: title.trim(),
        location: location.trim(),
        teamId,
        applyToSeries: applyToSeries && Boolean(event.eventSeriesId),
        priceCents,
        paymentTerms: {
          mode: paymentChoice,
          adminChoiceConfirmed: true,
          installmentCount: paymentChoice === 'installments' ? installmentCount : 1,
          cadence: paymentChoice === 'installments' ? installmentCadence : null,
          currency: 'usd',
        },
        paymentPolicies: priceCents > 0 ? {
          cancellation: cancellationPolicy.trim(),
          refund: refundPolicy.trim(),
        } : null,
      };
      if (lifecycleStatus !== originalLifecycleStatus) {
        update.lifecycleStatus = lifecycleStatus;
      }
      if (uploadedImage) {
        update.imageReservationId = uploadedImage.reservationId;
      }
      if (!update.applyToSeries) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const startAt = new Date(`${rawDate}T${rawTime}:00`);
        const endAt = new Date(`${rawDate}T${rawEndTime}:00`);
        if (
          !timeZone
          || Number.isNaN(startAt.getTime())
          || Number.isNaN(endAt.getTime())
          || localDateKey(startAt) !== rawDate
          || localDateKey(endAt) !== rawDate
          || startAt.toTimeString().slice(0, 5) !== rawTime
          || endAt.toTimeString().slice(0, 5) !== rawEndTime
        ) {
          throw new Error('Your browser could not resolve the selected date, time, and time zone.');
        }
        Object.assign(update, {
          dateKey: rawDate,
          startTime: rawTime,
          endTime: rawEndTime,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timeZone,
        } satisfies CrmEventOccurrenceInput);
      }
      const updatedEvent = await backendClient.updateEvent(
        tenantId,
        eventId,
        update,
        auditReason.trim(),
        idempotencyKey,
      );
      const imageReservationId = uploadedImage?.reservationId
        || (
          lifecycleStatus !== originalLifecycleStatus
            ? String(event.imageReservationId || event.imageAssetId || '').trim()
            : ''
        );
      if (imageReservationId) {
        await backendClient.publishImageAsset(
          tenantId,
          imageReservationId,
          'event',
          updatedEvent.eventIds || [],
          'Synchronize the verified event cover with event publication state.',
          `${uploadedImage ? imageUploadKey : idempotencyKey}:publish`,
        );
      }
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(event?.id || '') !== eventId
        || payloadSignature !== submittedSignature
      ) return;
      submitState = 'success';
      dispatch('success');
    } catch (err: unknown) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(event?.id || '') !== eventId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId = err instanceof BackendApiError ? err.requestId : null;
      console.error('Event update failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = `The event could not be updated.${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel event editing" tabindex="-1" on:click={handleClose}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="crm-ui-event-edit-panel" tabindex="-1" use:modalFocus={{ onEscape: handleClose }}>
      <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0">
      <div class="flex justify-between items-center pb-3 border-b border-gray-200">
        <h3 class="crm-ui-title" id="modal-title">Edit Event</h3>
        <button type="button" aria-label="Close event editor" disabled={submitState === 'loading'} on:click={handleClose} class="text-gray-400 hover:text-gray-600 p-1 rounded-md disabled:opacity-50">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mt-4 space-y-4">
        <ImageFilePicker
          inputId="event-edit-image"
          label="Event Image Banner"
          currentUrl={imageUrl}
          previewAlt="Event image"
          bind:selectedFile={imageFile}
          bind:validationMessage={imageValidationMessage}
          disabled={submitState === 'loading'}
        />

        <!-- Title -->
        <div>
          <label for="title" class="crm-ui-label-caps">Event Title *</label>
          <input
            type="text"
            id="title"
            bind:value={title}
            maxlength="200"
            class="crm-ui-input-teal"
            placeholder="e.g. Summer Championship Showcase"
          />
        </div>

        <EventPaymentTermsEditor bind:price bind:choice={paymentChoice} bind:installmentCount bind:cadence={installmentCadence} bind:cancellationPolicy bind:refundPolicy />

        <!-- Date & Time -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label for="event-date" class="crm-ui-label-caps">Date *</label>
            <input
              type="date"
              id="event-date"
              bind:value={rawDate}
              disabled={applyToSeries}
              class="crm-ui-input-teal"
            />
          </div>
          <div>
            <label for="event-time" class="crm-ui-label-caps">Time *</label>
            <input
              type="time"
              id="event-time"
              bind:value={rawTime}
              disabled={applyToSeries}
              class="crm-ui-input-teal"
            />
          </div>
          <div>
            <label for="event-end-time" class="crm-ui-label-caps">End time *</label>
            <input type="time" id="event-end-time" bind:value={rawEndTime} disabled={applyToSeries} class="crm-ui-input-teal disabled:bg-gray-100" />
          </div>
        </div>

        <!-- Location -->
        <div>
          <label for="location" class="crm-ui-label-caps">Location / Venue</label>
          <input
            type="text"
            id="location"
            bind:value={location}
            maxlength="500"
            class="crm-ui-input-teal"
            placeholder="e.g. Main Stadium Field A"
          />
        </div>

        <!-- Team Assignment & Status -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="team-select" class="crm-ui-label-caps">Assigned Team</label>
            <select
              id="team-select"
              bind:value={teamId}
              class="crm-ui-input-teal"
            >
              <option value="" disabled>Select a team</option>
              {#each Object.entries(teams) as [id, name]}
                <option value={id}>{name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="status-select" class="crm-ui-label-caps">Status</label>
            <select
              id="status-select"
              bind:value={lifecycleStatus}
              class="crm-ui-input-teal"
            >
              <option value="draft">Draft (Hidden)</option>
              <option value="archived">Archived (Hidden)</option>
              <option value="published">Published</option>
              {#if lifecycleStatus === 'status_unavailable'}<option value="status_unavailable" disabled>Status unavailable</option>{/if}
            </select>
          </div>
        </div>

        {#if publishConfirmationRequired}
          <div class="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p class="text-sm font-semibold text-amber-950">
              Publishing makes the event visible to its configured audience.
            </p>
            <p class="mt-1 text-xs text-amber-900">
              {applyToSeries
                ? `This will publish every loaded occurrence in the series (${seriesSize} shown).`
                : 'This publishes only this event occurrence.'}
              Tenant visibility and membership rules still apply.
            </p>
            <label for="edit-event-publish-confirmation" class="mt-3 block text-xs font-medium text-amber-950">
              Type <span class="font-semibold">{publishConfirmationText}</span>
            </label>
            <input
              id="edit-event-publish-confirmation"
              type="text"
              bind:value={publishConfirmation}
              autocomplete="off"
              class="mt-1 w-full rounded-md border border-amber-400 bg-white px-3 py-2 text-sm"
            />
          </div>
        {/if}

        <!-- Apply to Series Toggle -->
        {#if event && event.isMultiDateSeries && event.eventSeriesId}
          <div class="px-4 py-3 mt-4 bg-gray-50 border border-gray-200 rounded-md">
            <label class="flex items-center space-x-3 cursor-pointer">
              <div class="relative">
                <input type="checkbox" bind:checked={applyToSeries} class="sr-only" />
                <div class="crm-ui-event-toggle-track {applyToSeries ? 'crm-ui-event-toggle-active' : ''}"></div>
                <div class="crm-ui-event-toggle-dot {applyToSeries ? 'translate-x-4' : ''}"></div>
              </div>
              <div>
                <span class="text-sm font-semibold text-gray-900">Apply to all events in this series</span>
                <p class="crm-ui-hint-xs">Update title, location, team, and status. Dates and times stay unchanged for each occurrence.</p>
              </div>
            </label>
          </div>
        {/if}

        {#if errorMessage}
          <div class="crm-ui-danger">
            {errorMessage}
          </div>
        {/if}
      </div>

      <div class="mt-6 flex justify-end space-x-3 pt-3 border-t border-gray-100">
        <button type="button" disabled={submitState === 'loading'} on:click={handleClose} class="crm-ui-event-action-secondary">
          Cancel
        </button>
        <StatusButton
          type="button"
          state={submitState}
          on:click={handleSave}
          disabled={
            submitState === 'loading'
            || (
              publishConfirmationRequired
              && publishConfirmation !== publishConfirmationText
            )
          }
          idleText="Save Event Changes"
          loadingText="Saving..."
          successText="Saved!"
          errorText="Retry Event Update"
          class="crm-ui-event-action-primary"
        />
      </div>
      </fieldset>
    </div>
  </div>
</div>
