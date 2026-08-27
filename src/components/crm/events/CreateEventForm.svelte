<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type CrmEventOccurrenceInput } from '../../../lib/api/BackendApi';
  import {
    seasonsStore,
    teamsProjectionScope,
    teamsStore,
  } from '../../../lib/services/DataStore';
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import RecurrenceSelector from './RecurrenceSelector.svelte';
  import CreateRegistrationForm from '../registration/CreateRegistrationForm.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import EventPaymentTermsEditor from '../billing/EventPaymentTermsEditor.svelte';

  const dispatch = createEventDispatcher();

  export let seasonId: string | null = null;

  // Step state: 1 = Basics, 2 = When/Where, 3 = Review & Save
  let currentStep = 1;

  // Form State
  let title = '';
  let eventType = 'Practice'; // Smart default

  let teams: {id: string, name: string}[] = [];
  let selectedTeamId = '';
  $: teams = $teamsStore.map((team) => ({
    id: String(team.id),
    name: team.name || 'Team name unavailable',
  }));
  $: if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
    selectedTeamId = '';
  }
  $: if (!selectedTeamId && teams.length > 0) selectedTeamId = teams[0].id;

  let registrationForms: any[] = [];
  let selectedFormId = '';
  let showCreateForm = false;
  let registrationFormsError = '';
  let loadedRegistrationTenant = '';
  let unsubscribeRegistrationForms = () => {};

  $: if (($tenantIdStore || '') !== loadedRegistrationTenant) {
    loadedRegistrationTenant = $tenantIdStore || '';
    unsubscribeRegistrationForms();
    unsubscribeRegistrationForms = () => {};
    registrationForms = [];
    registrationFormsError = '';
    selectedFormId = '';
    if (loadedRegistrationTenant) {
      const subscribedTenant = loadedRegistrationTenant;
      unsubscribeRegistrationForms = RegistrationService.subscribeToForms(
        subscribedTenant,
        (forms) => {
          if (loadedRegistrationTenant !== subscribedTenant) return;
          registrationForms = forms;
        },
        () => {
          if (loadedRegistrationTenant !== subscribedTenant) return;
          console.error('Registration forms could not be loaded.');
          registrationFormsError = 'Registration forms could not be loaded.';
        },
      );
    }
  }

  onDestroy(() => unsubscribeRegistrationForms());

  function handleFormSelectionChange() {
    if (selectedFormId === 'CREATE_NEW') {
      selectedFormId = '';
      showCreateForm = true;
    }
  }

  function handleRegistrationCreated(e: CustomEvent) {
    if (e.detail && e.detail.id) {
      registrationForms = [...registrationForms, e.detail];
      selectedFormId = e.detail.id;
    }
    showCreateForm = false;
  }

  // Default to today at 5 PM for start time
  const today = new Date();
  today.setHours(17, 0, 0, 0);

  function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  type CalendarDay = {
    date: Date;
    key: string;
    dayNumber: number;
    inCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
  };

  let selectedDateKeys = [formatDateKey(today)];
  let timeSlots = [{ startTime: '17:00', endTime: '19:00' }];

  let showTimes = false;

  function formatTime12hr(time24: string) {
    if (!time24) return '';
    let [h, m] = time24.split(':');
    let hh = parseInt(h, 10);
    let ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `${hh}:${m} ${ampm}`;
  }

  function readableDate(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  }

  let location = '';
  let notes = '';
  let price = '0';
  let paymentChoice: 'pay_in_full' | 'installments' = 'pay_in_full';
  let installmentCount = 3;
  let installmentCadence: 'weekly' | 'monthly' = 'monthly';
  let cancellationPolicy = '';
  let refundPolicy = '';
  let imageFile: File | null = null;
  let imageValidationMessage = '';

  // Publishing State
  const publishMode = 'draft' as const;

  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let errorMessage = '';
  const auditReason = 'Event drafts created from CRM.';
  let idempotencyKey = createIdempotencyKey('event-series-create');
  let imageUploadKey = createIdempotencyKey('event-cover-upload');
  let payloadSignature = '';
  let currentPayloadSignature = '';
  let operationGeneration = 0;

  $: currentPayloadSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    title: title.trim(),
    eventType,
    selectedTeamId,
    selectedDateKeys,
    timeSlots,
    location: location.trim(),
    notes: notes.trim(),
    imageFile: imageFile
      ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
      : null,
    seasonId,
    selectedFormId,
    price,
    paymentChoice,
    installmentCount,
    installmentCadence,
    cancellationPolicy,
    refundPolicy,
    auditReason: auditReason.trim(),
  });
  $: {
    const signature = currentPayloadSignature;
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      idempotencyKey = createIdempotencyKey('event-series-create');
      imageUploadKey = createIdempotencyKey('event-cover-upload');
      if (submitState === 'error') submitState = 'idle';
      errorMessage = '';
    } else if (signature !== payloadSignature) {
      payloadSignature = signature;
      idempotencyKey = createIdempotencyKey('event-series-create');
      operationGeneration += 1;
      submitState = 'error';
      errorMessage =
        'The organization or event details changed while saving. Review the form and try again.';
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
  });

  function occurrenceInput(dateKey: string, startTime: string, endTime: string): CrmEventOccurrenceInput {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) throw new Error('Your browser time zone could not be determined.');
    const startAt = new Date(`${dateKey}T${startTime}:00`);
    const endAt = new Date(`${dateKey}T${endTime}:00`);
    if (
      Number.isNaN(startAt.getTime())
      || Number.isNaN(endAt.getTime())
      || formatDateKey(startAt) !== dateKey
      || formatDateKey(endAt) !== dateKey
      || startAt.toTimeString().slice(0, 5) !== startTime
      || endAt.toTimeString().slice(0, 5) !== endTime
    ) {
      throw new Error('Enter valid event dates and times.');
    }
    return {
      dateKey,
      startTime,
      endTime,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timeZone,
    };
  }

  function handleNext() {
    errorMessage = '';
    if (currentStep === 1) {
      if (!title.trim()) {
        errorMessage = 'Please provide an event title.';
        return;
      }
      imageValidationMessage = validateImageFile(imageFile);
      if (imageValidationMessage) {
        return;
      }
      currentStep++;
    } else if (currentStep === 2) {
      if (selectedDateKeys.length === 0 || !hasValidTimeSlots() || !hasUniqueTimeSlots()) {
        errorMessage = 'Select at least one event date and provide valid, unique event times.';
        return;
      }
      currentStep++;
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function handleCancel() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }

  function hasValidTimeSlots() {
    return timeSlots.length > 0 && timeSlots.every(({ startTime, endTime }) => (
      /^\d{2}:\d{2}$/.test(startTime)
      && /^\d{2}:\d{2}$/.test(endTime)
      && endTime > startTime
    ));
  }

  function hasUniqueTimeSlots() {
    return new Set(
      timeSlots.map(({ startTime, endTime }) => `${startTime}-${endTime}`),
    ).size === timeSlots.length;
  }

  async function handleSave() {
    if (submitState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      errorMessage = 'No active organization found.';
      return;
    }
    if (!selectedTeamId) {
      errorMessage = 'Assign the event to a team before saving.';
      currentStep = 1;
      return;
    }
    if (selectedDateKeys.length === 0) {
      errorMessage = 'Select at least one event date.';
      currentStep = 2;
      return;
    }
    if (!hasValidTimeSlots()) {
      errorMessage = 'Each event end time must be later than its start time.';
      currentStep = 2;
      return;
    }
    if (!hasUniqueTimeSlots()) {
      errorMessage = 'Remove duplicate event time slots before saving.';
      currentStep = 2;
      return;
    }
    if (selectedDateKeys.length * timeSlots.length > 200) {
      errorMessage = 'Create at most 200 event occurrences at a time.';
      currentStep = 2;
      return;
    }
    const normalizedPrice = price.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedPrice)) {
      errorMessage = 'Enter a valid registration price with no more than two decimal places.';
      return;
    }
    const priceCents = Math.round(Number(normalizedPrice) * 100);
    if (priceCents > 0 && !selectedFormId) {
      errorMessage = 'Select a registration form before charging for this event.';
      return;
    }
    if (priceCents > 0 && (!cancellationPolicy.trim() || !refundPolicy.trim())) {
      errorMessage = 'Add the cancellation and refund policies families should see.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = currentPayloadSignature;
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      idempotencyKey = createIdempotencyKey('event-series-create');
    }
    const operationKey = idempotencyKey;
    submitState = 'loading';
    errorMessage = '';

    try {
      const flatOccurrences = selectedDateKeys.flatMap(dateKey =>
        timeSlots.map(slot => occurrenceInput(dateKey, slot.startTime, slot.endTime))
      );
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
        || payloadSignature !== submittedSignature
      ) return;
      const createdEvent = await backendClient.createEventSeries(
        tenantId,
        {
          teamId: selectedTeamId,
          title: title.trim(),
          type: eventType,
          occurrences: flatOccurrences,
          location: location.trim(),
          notes: notes.trim(),
          imageReservationId: uploadedImage?.reservationId || null,
          seasonId: seasonId || null,
          registrationFormId: selectedFormId || null,
          publishMode,
          priceCents,
          paymentTerms: {
            mode: paymentChoice,
            adminChoiceConfirmed: true,
            installmentCount: paymentChoice === 'installments' ? installmentCount : 1,
            cadence: paymentChoice === 'installments' ? installmentCadence : null,
            currency: 'usd',
            version: 1,
          },
          paymentPolicies: priceCents > 0 ? {
            cancellation: cancellationPolicy.trim(),
            refund: refundPolicy.trim(),
          } : null,
        },
        auditReason.trim(),
        operationKey,
      );
      if (uploadedImage) {
        await backendClient.publishImageAsset(
          tenantId,
          uploadedImage.reservationId,
          'event',
          createdEvent.eventIds || [],
          'Bind the verified event cover to the created event series.',
          `${imageUploadKey}:publish`,
        );
      }
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      submitState = 'success';
      dispatch('success');
    } catch (err: unknown) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId = err instanceof BackendApiError ? err.requestId : null;
      console.error('Event draft creation failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = `The event drafts could not be created.${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <!-- Background overlay -->
  <div class="crm-ui-modal-shell">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel event creation" tabindex="-1" on:click={handleCancel}></button>

    <!-- This element is to trick the browser into centering the modal contents. -->
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="crm-ui-event-create-panel" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0">

      <!-- Progress Steps -->
      <div class="mb-8">
        <div class="flex items-center justify-between relative">
          <div class="crm-ui-event-step-line" aria-hidden="true"></div>

          <div class="relative z-10 flex flex-col items-center">
            <div class="crm-ui-event-step-dot {currentStep >= 1 ? 'crm-ui-event-step-dot-active' : 'crm-ui-event-step-dot-idle'}">1</div>
            <span class="text-xs mt-1 text-gray-500 font-medium">Basics</span>
          </div>

          <div class="relative z-10 flex flex-col items-center">
            <div class="crm-ui-event-step-dot {currentStep >= 2 ? 'crm-ui-event-step-dot-active' : 'crm-ui-event-step-dot-idle'}">2</div>
            <span class="text-xs mt-1 text-gray-500 font-medium">When & Where</span>
          </div>

          <div class="relative z-10 flex flex-col items-center">
            <div class="crm-ui-event-step-dot {currentStep >= 3 ? 'crm-ui-event-step-dot-active' : 'crm-ui-event-step-dot-idle'}">3</div>
            <span class="text-xs mt-1 text-gray-500 font-medium">Review</span>
          </div>
        </div>
      </div>

      <div class="sm:flex sm:items-start">
        <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
          {#if currentStep === 1}
            <h3 class="crm-ui-modal-title" id="modal-title">
              Let's create a new event
            </h3>
            <div class="mt-4 space-y-4">
              <div>
                <label for="title" class="crm-ui-label">Event Title</label>
                <div class="mt-1">
                  <input type="text" name="title" id="title" bind:value={title} maxlength="200" class="crm-ui-input-teal-compact" placeholder="e.g. U12 Practice, Championship Game">
                </div>
              </div>

              <div class="crm-ui-grid-two">
                <div>
                  <label for="type" class="crm-ui-label">Event Type</label>
                  <div class="mt-1">
                    <select id="type" name="type" bind:value={eventType} class="crm-ui-input-teal-compact">
                      <option value="Practice">Practice</option>
                      <option value="Game">Game</option>
                      <option value="Meeting">Meeting</option>
                      <option value="Tournament">Tournament</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label for="team" class="crm-ui-label">Team</label>
                  <div class="mt-1">
                    <select id="team" name="team" bind:value={selectedTeamId} class="crm-ui-input-teal-compact">
                      {#each teams as team}
                        <option value={team.id}>{team.name}</option>
                      {/each}
                      {#if teams.length === 0}
                        <option value="" disabled>Select a team</option>
                      {/if}
                    </select>
                    {#if $teamsProjectionScope.loading}
                      <p class="crm-ui-hint" role="status">Loading teams…</p>
                    {:else if $teamsProjectionScope.error}
                      <p class="mt-1 text-xs text-red-700" role="alert">{$teamsProjectionScope.error}</p>
                    {:else if $teamsProjectionScope.truncated}
                      <p class="mt-1 text-xs text-amber-700">Only the first {$teamsProjectionScope.limit} teams are available.</p>
                    {/if}
                  </div>
                </div>

                <div class="col-span-2">
                  <label for="season" class="crm-ui-label">Season (Optional)</label>
                  <div class="mt-1">
                    <select id="season" name="season" bind:value={seasonId} class="crm-ui-input-teal-compact">
                      <option value={null}>-- No Season --</option>
                      {#each $seasonsStore as s}
                        <option value={s.id}>{s.name || s.title || 'Season name unavailable'}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              </div>

              <ImageFilePicker
                inputId="event-create-image"
                label="Cover Image (Optional)"
                bind:selectedFile={imageFile}
                bind:validationMessage={imageValidationMessage}
                disabled={submitState === 'loading'}
              />
            </div>
          {:else if currentStep === 2}
            <h3 class="crm-ui-modal-title" id="modal-title">
              Choose the event days
            </h3>
            <p class="mt-1 text-sm text-gray-500">Generate a recurring schedule or manually select dates on the calendar.</p>
            <div class="mt-4">
              <RecurrenceSelector bind:selectedDateKeys />
            </div>

            <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm mt-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected dates ({selectedDateKeys.length})</p>
                {#if selectedDateKeys.length > 0}
                  <div class="mt-2 flex flex-wrap gap-2">
                    {#each selectedDateKeys as dateKey (dateKey)}
                        <button
                          type="button"
                          on:click={() => selectedDateKeys = selectedDateKeys.filter((selectedDate) => selectedDate !== dateKey)}
                          class="crm-ui-event-date-pill"
                          aria-label={`Remove ${readableDate(dateKey)}`}
                        >
                          {readableDate(dateKey)}
                          <span aria-hidden="true" class="text-cyan-700">×</span>
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="mt-1 text-xs text-red-600">Select at least one date.</p>
                  {/if}
                </div>

              {#if !showTimes}
                <button type="button" class="crm-ui-event-time-preview" on:click={() => showTimes = true}>
                  <div class="flex justify-between items-center">
                    <div>
                      <span class="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Time{timeSlots.length > 1 ? 's' : ''}</span>
                      {#each timeSlots as slot}
                        <span class="block text-sm font-medium text-gray-900">{formatTime12hr(slot.startTime)} - {formatTime12hr(slot.endTime)}</span>
                      {/each}
                    </div>
                    <span class="text-[#00a4bd] text-xs font-semibold">Edit</span>
                  </div>
                </button>
              {:else}
                <div class="crm-ui-event-time-editor">
                  <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Time{timeSlots.length > 1 ? 's' : ''}</span>
                    <button type="button" on:click={() => showTimes = false} class="text-[#00a4bd] text-xs font-semibold">Done</button>
                  </div>
                  <div class="space-y-4">
                    {#each timeSlots as slot, index}
                      <div class="crm-ui-event-time-row">
                        {#if timeSlots.length > 1}
                          <button type="button" class="absolute top-2 right-2 text-gray-400 hover:text-red-500" on:click={() => timeSlots = timeSlots.filter((_, i) => i !== index)}>
                            <span class="sr-only">Remove</span>
                            <span aria-hidden="true" class="text-lg leading-none">&times;</span>
                          </button>
                        {/if}
                        <div class="flex-1">
                          <label for="start-time-{index}" class="crm-ui-label">Start Time</label>
                          <input type="time" id="start-time-{index}" bind:value={slot.startTime} class="crm-ui-input-teal-block">
                        </div>
                        <div class="flex-1">
                          <label for="end-time-{index}" class="crm-ui-label">End Time</label>
                          <input type="time" id="end-time-{index}" bind:value={slot.endTime} class="crm-ui-input-teal-block">
                        </div>
                      </div>
                    {/each}
                  </div>
                  <button type="button" on:click={() => timeSlots = [...timeSlots, { startTime: '17:00', endTime: '19:00' }]} class="crm-ui-event-link mt-3">
                    + Add another time
                  </button>
                </div>
              {/if}

              <div class="border-t border-gray-100 pt-4">
                <label for="location" class="crm-ui-label">Location (Optional)</label>
                <div class="mt-1">
                  <input type="text" name="location" id="location" bind:value={location} maxlength="500" class="crm-ui-input-teal-compact" placeholder="e.g. Field B, Main Stadium">
                </div>
              </div>
          {:else if currentStep === 3}
            <h3 class="crm-ui-modal-title" id="modal-title">
              Review & save drafts
            </h3>

            <div class="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 class="font-bold text-gray-900">{title} <span class="crm-ui-event-type-pill">{eventType}</span></h4>

              <div class="mt-2 text-sm text-gray-600 space-y-1">
                <p><strong>Dates:</strong> {selectedDateKeys.map(readableDate).join(', ')}</p>
                <p><strong>Times:</strong></p>
                <ul class="list-disc pl-5">
                  {#each timeSlots as slot}
                    <li>{formatTime12hr(slot.startTime)} &ndash; {formatTime12hr(slot.endTime)}</li>
                  {/each}
                </ul>
                {#if location}
                  <p><strong>Location:</strong> {location}</p>
                {/if}
              </div>
            </div>

            <div class="mt-4 border-t border-gray-100 pt-4">
              <p class="block text-sm font-medium text-gray-700 mb-2">Lifecycle</p>
              <p class="crm-ui-notice-card">
                These records will be saved as drafts. Review and publish them from Events when they are ready for tenant-scoped consumer feeds.
              </p>
            </div>

            <div class="mt-4 border-t border-gray-100 pt-4">
              <label for="notes" class="crm-ui-label">Additional Notes (Optional)</label>
              <div class="mt-1">
                <textarea id="notes" name="notes" rows="2" bind:value={notes} maxlength="5000" class="crm-ui-input-teal-compact" placeholder="Any extra information for the team..."></textarea>
              </div>
            </div>

            <div class="mt-4 border-t border-gray-100 pt-4">
              <label for="event-registration-form" class="block text-sm font-medium text-gray-700 mb-1">Registration Form</label>
              <p class="text-xs text-gray-500 mb-2">Select a registration form to attach to this event, or create a new one.</p>
              <select id="event-registration-form" bind:value={selectedFormId} on:change={handleFormSelectionChange} class="crm-ui-input-teal-wide">
                <option value="">-- No Registration Needed --</option>
                {#each registrationForms as form}
                  <option value={form.id}>{form.title}</option>
                {/each}
                <option value="CREATE_NEW" class="font-bold text-[#00a4bd]">+ Create New Form</option>
              </select>
              {#if registrationFormsError}
                <p class="mt-2 text-xs text-red-700" role="alert">{registrationFormsError}</p>
              {/if}

            </div>

            <div class="mt-4 border-t border-gray-100 pt-4">
              <EventPaymentTermsEditor bind:price bind:choice={paymentChoice} bind:installmentCount bind:cadence={installmentCadence} bind:cancellationPolicy bind:refundPolicy />
            </div>
          {/if}

          {#if errorMessage}
            <div class="crm-ui-danger mt-4">
              {errorMessage}
            </div>
          {/if}
        </div>
      </div>
      <div class="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
        {#if currentStep < 3}
          <button type="button" on:click={handleNext} class="crm-ui-event-step-primary">
            Next
          </button>
        {:else}
          <StatusButton
            type="button"
            state={submitState}
            on:click={handleSave}
            disabled={submitState === 'loading'}
            idleText="Save event drafts"
            loadingText="Processing..."
            successText="Success!"
            errorText="Retry draft save"
            class="crm-ui-event-step-primary"
          />
        {/if}

        {#if currentStep > 1}
          <button type="button" disabled={submitState === 'loading'} on:click={handleBack} class="crm-ui-event-step-secondary">
            Back
          </button>
        {/if}

        <button type="button" disabled={submitState === 'loading'} on:click={handleCancel} class="crm-ui-event-step-cancel">
          Cancel
        </button>
      </div>
      </fieldset>
    </div>
  </div>
</div>

{#if showCreateForm}
  <CreateRegistrationForm
    on:success={handleRegistrationCreated}
    on:cancel={() => showCreateForm = false}
  />
{/if}
