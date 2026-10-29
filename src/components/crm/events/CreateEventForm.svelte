<script lang="ts">
  import { programTermsStore } from '../../../lib/crm/programVocabulary';
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
  import RecurrenceSelector from './EventRecurrenceEditor.svelte';
  import CreateRegistrationForm from '../registration/CreateRegistrationForm.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { buildTeamReferenceIndex, teamReferenceMatches } from '../../../lib/ui/teamReferences';
  import EventCreationPreview from './EventCreationPreview.svelte';
  import EventPaymentTermsEditor from '../billing/EventPaymentTermsEditor.svelte';

  const dispatch = createEventDispatcher();

  export let seasonId: string | null = null;
  export let teamId: string | null = null;

  // Schedule, when/where, details, registration, then published-event preview.
  let currentStep = 1;

  // Form State
  let title = '';
  let eventType = '';
  let scheduleKind: 'one_time' | 'recurring' | '' = '';

  let teams: {id: string, name: string}[] = [];
  let selectedTeamId = '';
  $: teams = $teamsStore.map((team) => ({
    id: String(team.id),
    name: team.name || 'Team name unavailable',
  }));
  $: if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
    selectedTeamId = '';
  }
  $: if (teamId && teamReferences.get(teamId)?.documentId) selectedTeamId = teamReferences.get(teamId)!.documentId;

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

  function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  let selectedDateKeys: string[] = [];
  let oneTimeDate = '';
  let recurrenceStartDate = formatDateKey(new Date());
  let recurrenceEndDate = '';
  let recurrencePattern = 'weekly';
  let recurrenceDays = [new Date().getDay()];
  let recurrenceSkipped: string[] = [];
  let timeSlots = [{ startTime: '', endTime: '' }];

  $: if (scheduleKind === 'one_time') {
    selectedDateKeys = oneTimeDate ? [oneTimeDate] : [];
  }

  let location = '';
  let notes = '';
  let price = '0';
  let paymentChoice: 'pay_in_full' | 'installments' = 'pay_in_full';
  let installmentCount = 3;
  let installmentCadence: 'weekly' | 'monthly' = 'monthly';
  let coverPreviewUrl = '';
  let previousCoverFile: File | null = null;
  let coverRevision = 0;
  $: if (imageFile !== previousCoverFile) {
    coverRevision += 1;
    if (coverPreviewUrl) URL.revokeObjectURL?.(coverPreviewUrl);
    previousCoverFile = imageFile;
    coverPreviewUrl = imageFile && !validateImageFile(imageFile) && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(imageFile) : '';
  }
  onDestroy(() => { if (coverPreviewUrl) URL.revokeObjectURL?.(coverPreviewUrl); });
  let extraForm = false;
  $: teamReferences = buildTeamReferenceIndex($teamsStore);
  $: eligibleSeasons = $seasonsStore.filter((season) => ['active', 'upcoming'].includes(String(season.status || '').toLowerCase()) && (!season.teamId || ['all', 'program', 'general'].includes(String(season.teamId)) || teamReferenceMatches(teamReferences, season.teamId, selectedTeamId)));
  $: if (seasonId && !eligibleSeasons.some((season) => String(season.id) === seasonId)) seasonId = null;
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
    scheduleKind,
    selectedTeamId,
    selectedDateKeys,
    timeSlots,
    location: location.trim(),
    notes: notes.trim(),
    coverRevision,
    imageFile: imageFile
      ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
      : null,
    seasonId,
    selectedFormId,
    price,
    paymentChoice,
    installmentCount,
    installmentCadence,
    extraForm,
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
    if (currentStep === 1 && !scheduleKind) { errorMessage = 'Choose a one-time or repeating schedule.'; return; }
    if (currentStep === 2 && (!selectedDateKeys.length || !hasValidTimeSlots() || !hasUniqueTimeSlots() || hasOverlappingTimeSlots() || selectedDateKeys.length * timeSlots.length > 200)) { errorMessage = 'Choose dates and valid, non-overlapping times for up to 200 sessions.'; return; }
    if (currentStep === 3 && (!title.trim() || !eventType || !selectedTeamId)) { errorMessage = 'Provide an event name, type, and team.'; return; }
    if (currentStep === 4) {
      imageValidationMessage = validateImageFile(imageFile);
      if (imageValidationMessage) return;
      if (!seasonId && (!/^\d+(\.\d{1,2})?$/.test(price.trim()) || Number(price) < 0)) { errorMessage = 'Enter a price of $0 or more.'; return; }
      if (!seasonId && Number(price) > 0 && !selectedFormId) { errorMessage = 'Choose a registration form for this paid event.'; return; }
    }
    currentStep++;
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

  function hasOverlappingTimeSlots() {
    const sorted = [...timeSlots].sort((first, second) => first.startTime.localeCompare(second.startTime));
    return sorted.some((slot, index) => index > 0 && slot.startTime < sorted[index - 1].endTime);
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
      currentStep = 3;
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
    if (hasOverlappingTimeSlots()) {
      errorMessage = 'Event time slots cannot overlap.';
      currentStep = 2;
      return;
    }
    if (selectedDateKeys.length * timeSlots.length > 200) {
      errorMessage = 'Create at most 200 event occurrences at a time.';
      currentStep = 2;
      return;
    }
    const normalizedPrice = seasonId ? '0' : price.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedPrice)) {
      errorMessage = 'Enter a valid registration price with no more than two decimal places.';
      return;
    }
    const priceCents = Math.round(Number(normalizedPrice) * 100);
    if (priceCents > 0 && !selectedFormId) {
      errorMessage = 'Select a registration form before charging for this event.';
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
          seasonCoverage: Boolean(seasonId),
          registrationFormId: seasonId && !extraForm ? null : selectedFormId || null,
          publishMode,
          priceCents,
          paymentTerms: {
            mode: priceCents > 0 ? paymentChoice : 'pay_in_full',
            adminChoiceConfirmed: true,
            installmentCount: priceCents > 0 && paymentChoice === 'installments' ? installmentCount : 1,
            cadence: priceCents > 0 && paymentChoice === 'installments' ? installmentCadence : null,
            currency: 'usd',
            version: 1,
          },
          paymentPolicies: null,
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
      errorMessage = 'The event draft could not be created.';
      submitState = 'error';
    }
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="event-create-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel event creation" tabindex="-1" on:click={handleCancel}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
    <div class="crm-ui-event-create-panel" tabindex="-1" use:modalFocus={{ onEscape: handleCancel }}>
      <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0 text-left">
        <p class="mb-4 text-xs font-medium text-gray-500">Step {currentStep} of 5 · {['Schedule', 'When & where', 'Event details', 'Registration & cost', 'Preview'][currentStep - 1]}</p>
        <div class="mb-6 flex gap-1.5" aria-hidden="true">{#each [1, 2, 3, 4, 5] as step}<span class="h-1 flex-1 rounded-full {currentStep >= step ? 'bg-[var(--crm-brand-control)]' : 'bg-gray-200'}"></span>{/each}</div>
        <h3 class="crm-ui-modal-title mb-5" id="event-create-title">{['New event', 'When and where?', 'Event details', 'Registration & cost', 'Preview your event'][currentStep - 1]}</h3>
        <div class="space-y-5">
        {#if currentStep === 1}
          <fieldset><legend class="crm-ui-label mb-3">How often?</legend><div class="grid gap-3 sm:grid-cols-2">
            <label class="rounded-xl border border-gray-200 p-5"><input type="radio" bind:group={scheduleKind} value="one_time" /> <strong class="ml-2 text-sm">One-time</strong><span class="mt-3 block text-xs text-gray-500">One date, with one or more time slots.</span></label>
            <label class="rounded-xl border border-gray-200 p-5"><input type="radio" bind:group={scheduleKind} value="recurring" /> <strong class="ml-2 text-sm">Repeating</strong><span class="mt-3 block text-xs text-gray-500">One event with a repeating schedule.</span></label>
          </div></fieldset>
        {:else if currentStep === 2}
          {#if scheduleKind === 'one_time'}<label class="crm-ui-label block">Event date<input type="date" bind:value={oneTimeDate} class="crm-ui-input mt-2" /></label>{:else}<RecurrenceSelector bind:selectedDateKeys bind:startDate={recurrenceStartDate} bind:endDate={recurrenceEndDate} bind:pattern={recurrencePattern} bind:days={recurrenceDays} bind:skipped={recurrenceSkipped} />{/if}
          {#each timeSlots as slot, index}<div class="grid grid-cols-2 gap-3"><label class="crm-ui-label">Start time<input type="time" bind:value={slot.startTime} class="crm-ui-input mt-2" /></label><label class="crm-ui-label">End time<input type="time" bind:value={slot.endTime} class="crm-ui-input mt-2" /></label></div>{#if index > 0}<button type="button" class="text-sm text-[var(--crm-brand-link)]" on:click={() => timeSlots = timeSlots.filter((_, i) => i !== index)}>Remove time slot</button>{/if}{/each}
          <label class="crm-ui-label block">Location <span class="font-normal text-gray-500">Optional</span><input type="text" bind:value={location} maxlength="500" class="crm-ui-input mt-2" placeholder="e.g. Main field" /></label>
          <details><summary class="cursor-pointer text-sm text-[var(--crm-brand-link)]">Additional time slots</summary><button type="button" class="mt-3 text-sm text-[var(--crm-brand-link)]" on:click={() => timeSlots = [...timeSlots, { startTime: '', endTime: '' }]}>+ Add another time slot</button></details>
        {:else if currentStep === 3}
          <label class="crm-ui-label block">Event name<input type="text" bind:value={title} maxlength="200" class="crm-ui-input mt-2" placeholder="e.g. Varsity practice" /></label>
          <label class="crm-ui-label block">Event type<select bind:value={eventType} class="crm-ui-input mt-2"><option value="" disabled>Choose a type</option>{#each $programTermsStore.types as type}<option value={type}>{type}</option>{/each}</select></label>
          <label class="crm-ui-label block">{$programTermsStore.group}<select bind:value={selectedTeamId} disabled={Boolean(teamId)} class="crm-ui-input mt-2"><option value="" disabled>Choose a {$programTermsStore.group.toLowerCase()}</option>{#each teams as team}<option value={team.id}>{team.name}</option>{/each}</select></label>
          {#if $teamsProjectionScope.error}<p class="text-sm text-red-700" role="alert">{$teamsProjectionScope.error}</p>{/if}
        {:else if currentStep === 4}
          <label class="crm-ui-label block">Attach to a season <span class="font-normal text-gray-500">Optional</span><select bind:value={seasonId} class="crm-ui-input mt-2"><option value={null}>No season</option>{#each eligibleSeasons as season}<option value={String(season.id)}>{season.name || season.title || 'Season name unavailable'}</option>{/each}</select></label>
          {#if seasonId}<div class="rounded-xl bg-[var(--crm-brand-surface)] p-4 text-sm text-[var(--crm-on-brand-surface)]"><strong>Included with the season</strong><p class="mt-2">Only covered season participants can register. No additional event charge.</p></div><label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={extraForm} />Collect an additional event form</label>
          {:else}<EventPaymentTermsEditor currency="USD" bind:price bind:choice={paymentChoice} bind:installmentCount bind:cadence={installmentCadence} />{/if}
          {#if !seasonId || extraForm}<label class="crm-ui-label block">Registration form<select bind:value={selectedFormId} on:change={handleFormSelectionChange} class="crm-ui-input mt-2"><option value="" disabled={!seasonId && Number(price) > 0}>{!seasonId && Number(price) > 0 ? 'Choose a registration form' : 'No new form needed'}</option>{#each registrationForms as form}<option value={form.id}>{form.title}</option>{/each}<option value="CREATE_NEW">+ Create a new form</option></select></label>{/if}
          {#if registrationFormsError}<p class="text-sm text-red-700" role="alert">{registrationFormsError}</p>{/if}
          <ImageFilePicker inputId="event-create-image" label="Cover image (Optional)" currentUrl={coverPreviewUrl} photo bind:selectedFile={imageFile} bind:validationMessage={imageValidationMessage} disabled={submitState === 'loading'} />
          <label class="crm-ui-label block">Notes for the team <span class="font-normal text-gray-500">Optional</span><textarea bind:value={notes} maxlength="5000" rows="2" class="crm-ui-input mt-2"></textarea></label>
        {:else}
          <EventCreationPreview {title} type={eventType} team={teams.find((team) => team.id === selectedTeamId)?.name || ''} dates={selectedDateKeys} slots={timeSlots} {location} {notes} imageUrl={coverPreviewUrl} seasonName={eligibleSeasons.find((season) => String(season.id) === seasonId)?.name || eligibleSeasons.find((season) => String(season.id) === seasonId)?.title || ''} price={Number(price)} installments={paymentChoice === 'installments' ? installmentCount : 1} cadence={installmentCadence} registration={Boolean(selectedFormId)} />
        {/if}
        </div>
        {#if errorMessage}<p class="crm-ui-danger mt-4" role="alert">{errorMessage}</p>{/if}
        <div class="mt-6 border-t border-gray-200 pt-4">
          {#if currentStep < 5}<button type="button" class="crm-ui-event-step-primary" on:click={handleNext}>{['Continue to date & time', 'Continue to event details', 'Continue to registration', 'Review event'][currentStep - 1]}</button>{:else}<StatusButton state={submitState} on:click={handleSave} idleText="Save draft" loadingText="Saving…" successText="Saved" errorText="Retry save" class="crm-ui-event-step-primary" />{/if}
          {#if currentStep > 1}<button type="button" class="crm-ui-event-step-secondary" on:click={handleBack}>Back</button>{:else}<button type="button" class="crm-ui-event-step-cancel" on:click={handleCancel}>Cancel</button>{/if}
        </div>
      </fieldset>
    </div>
  </div>
</div>
{#if showCreateForm}<CreateRegistrationForm on:success={handleRegistrationCreated} on:cancel={() => showCreateForm = false} />{/if}
