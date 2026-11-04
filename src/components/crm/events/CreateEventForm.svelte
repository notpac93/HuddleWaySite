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
  import './schedule-creation.css';
  import ScheduleDatePicker from './ScheduleDatePicker.svelte';
  import ScheduleOccurrenceEditor from './ScheduleOccurrenceEditor.svelte';
  import Icon from '../ui/Icon.svelte';
  import { fullscreenMessage } from '../messages/fullscreenMessage';
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
  let scheduleKind: 'one_time' | 'recurring' | 'dates' | '' = '';

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
  let recurrenceStartDate = '';
  let recurrenceEndDate = '';
  let recurrencePattern = 'weekly';
  let recurrenceDays: number[] = [];
  let recurrenceSkipped: string[] = [];
  let occurrenceOverrides: Record<string, { title?: string; location?: string; startTime?: string; endTime?: string }> = {};
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
    occurrenceOverrides,
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
    if (currentStep === 1 && !scheduleKind) { errorMessage = 'Choose how often to add to your schedule.'; return; }
    if (currentStep === 2 && (!selectedDateKeys.length || !hasValidTimeSlots() || !hasUniqueTimeSlots() || hasOverlappingTimeSlots() || selectedDateKeys.length * timeSlots.length > 200)) { errorMessage = 'Choose dates and valid, non-overlapping times for up to 200 sessions.'; return; }
    if (currentStep === 3 && (!title.trim() || !selectedTeamId)) { errorMessage = 'Add a name and choose a group.'; return; }
    if (currentStep === 4) {
      imageValidationMessage = validateImageFile(imageFile);
      if (imageValidationMessage) return;
      if (!seasonId && (!/^\d+(\.\d{1,2})?$/.test(price.trim()) || Number(price) < 0)) { errorMessage = 'Enter a price of $0 or more.'; return; }
      if (!seasonId && Number(price) > 0 && !selectedFormId) { errorMessage = 'Choose a registration form for this paid event.'; return; }
    }
    currentStep++;
  }

  function scheduleSummary() {
    const date = selectedDateKeys[0];
    const dateLabel = selectedDateKeys.length === 1 && date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : `${selectedDateKeys.length} dates`;
    const timeLabel = (value: string) => new Date(`2026-01-01T${value}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateLabel} · ${timeSlots.length === 1 ? `${timeLabel(timeSlots[0].startTime)}–${timeLabel(timeSlots[0].endTime)}` : `${timeSlots.length} times per date`}`;
  }

  function choosePattern(kind: 'one_time' | 'recurring' | 'dates') {
    if (scheduleKind !== kind) { selectedDateKeys = []; oneTimeDate = ''; recurrenceStartDate = ''; recurrenceEndDate = ''; recurrenceDays = []; recurrenceSkipped = []; occurrenceOverrides = {}; }
    scheduleKind = kind; errorMessage = ''; currentStep = 2;
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

  function customizedOccurrencesValid() {
    return selectedDateKeys.every(date => {
      const slots = timeSlots.map((slot, index) => ({ ...slot, ...occurrenceOverrides[`${date}:${index}`] })).sort((a, b) => a.startTime.localeCompare(b.startTime));
      return slots.every((slot, index) => /^\d{2}:\d{2}$/.test(slot.startTime) && /^\d{2}:\d{2}$/.test(slot.endTime) && slot.endTime > slot.startTime && (!index || slot.startTime >= slots[index - 1].endTime));
    });
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
    if (!title.trim()) { errorMessage = 'Add an activity name.'; currentStep = 3; return; }
    if (!customizedOccurrencesValid()) { errorMessage = 'Check the customized times. Sessions must end after they start and cannot overlap.'; currentStep = 5; return; }
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
        timeSlots.map((slot, index) => {
          const edit = occurrenceOverrides[`${dateKey}:${index}`] || {};
          return { ...occurrenceInput(dateKey, edit.startTime ?? slot.startTime, edit.endTime ?? slot.endTime), ...(edit.title?.trim() ? { title: edit.title.trim() } : {}), ...(edit.location !== undefined ? { location: edit.location.trim() } : {}) };
        })
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
          type: eventType.trim() || 'Other',
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

<div class="schedule-create-anchor">
<div class="schedule-create-screen crm-theme-default-host" aria-labelledby="event-create-title" role="dialog" aria-modal="true" tabindex="-1" use:fullscreenMessage use:modalFocus={{ onEscape: handleCancel }}>
  <header class="schedule-create-header"><button type="button" class="schedule-icon" aria-label={currentStep > 1 ? 'Back' : 'Back to Schedule'} disabled={submitState === 'loading'} on:click={currentStep > 1 ? handleBack : handleCancel}><Icon name="chevronRight" size={24} className="schedule-back-icon" /></button><strong>Add to Schedule</strong><button type="button" class="schedule-icon" aria-label="Close schedule creation" disabled={submitState === 'loading'} on:click={handleCancel}><Icon name="close" size={20} /></button></header>
  <div class="schedule-create-scroll">
    <fieldset disabled={submitState === 'loading'} class="schedule-create-content">
      <nav class="schedule-steps" aria-label="Creation progress">{#each ['Pattern', 'When', 'Name', 'Details', 'Review'] as label, index}<span aria-current={currentStep === index + 1 ? 'step' : undefined}>{label}</span>{/each}</nav>
      <h2 id="event-create-title">{['How often?', 'When?', 'What will you call it?', 'Make it yours', 'Review your schedule'][currentStep - 1]}</h2>
      <div class="schedule-step-content">
      {#if currentStep === 1}
        <div class="schedule-pattern-options">{#each [{ kind: 'one_time', name: 'Once', marks: [9] }, { kind: 'recurring', name: 'Repeats', marks: [2, 9, 16] }, { kind: 'dates', name: 'Choose dates', marks: [1, 10, 19] }] as option}
          <button type="button" class="schedule-pattern-option" on:click={() => choosePattern(option.kind as 'one_time' | 'recurring' | 'dates')}><span class="schedule-pattern-picture" aria-hidden="true">{#each Array.from({ length: 21 }, (_, index) => index) as dot}<i class:marked={option.marks.includes(dot)}></i>{/each}</span><span><strong>{option.name}</strong></span><Icon name="chevronRight" size={20} /></button>
        {/each}</div>
      {:else if currentStep === 2}
        {#if scheduleKind === 'one_time'}<label class="schedule-field">Date<input type="date" aria-label="Date" bind:value={oneTimeDate} /></label>
        {:else if scheduleKind === 'dates'}<ScheduleDatePicker bind:selectedDateKeys />
        {:else}<RecurrenceSelector bind:selectedDateKeys bind:startDate={recurrenceStartDate} bind:endDate={recurrenceEndDate} bind:pattern={recurrencePattern} bind:days={recurrenceDays} bind:skipped={recurrenceSkipped} />{/if}
        {#each timeSlots as slot, index}<div class="schedule-field-pair"><label class="schedule-field">Starts<input type="time" aria-label={index === 0 ? 'Start time' : `Start time ${index + 1}`} bind:value={slot.startTime} /></label><label class="schedule-field">Ends<input type="time" aria-label={index === 0 ? 'End time' : `End time ${index + 1}`} bind:value={slot.endTime} /></label></div>{#if index > 0}<button type="button" class="schedule-text-button" on:click={() => timeSlots = timeSlots.filter((_, i) => i !== index)}>Remove time slot</button>{/if}{/each}
        <details class="schedule-extra"><summary>More times</summary><button type="button" class="schedule-text-button" on:click={() => timeSlots = [...timeSlots, { startTime: '', endTime: '' }]}>Add time slot</button></details>
      {:else if currentStep === 3}
        <div class="schedule-chosen-summary"><Icon name="events" size={20} /><span>{scheduleSummary()}</span><button type="button" class="schedule-icon" aria-label="Edit schedule" on:click={() => currentStep = 2}><Icon name="pencil" size={16} /></button></div>
        <label class="schedule-field schedule-name-field">Activity name<input type="text" bind:value={title} maxlength="200" placeholder="Your activity name" /></label><div class="schedule-name-later"><Icon name="pencil" size={16} />Your wording · Change anytime</div>
        <details class="schedule-extra"><summary>Label <span>Optional</span></summary><label class="schedule-field">Activity label<input type="text" list="schedule-label-suggestions" bind:value={eventType} maxlength="80" placeholder="Your own label" /><datalist id="schedule-label-suggestions">{#each $programTermsStore.types as type}<option value={type}></option>{/each}</datalist></label></details>
        <label class="schedule-field">{$programTermsStore.group}<select aria-label={$programTermsStore.group} bind:value={selectedTeamId} disabled={Boolean(teamId)}><option value="" disabled>Choose a {$programTermsStore.group.toLowerCase()}</option>{#each teams as team}<option value={team.id}>{team.name}</option>{/each}</select></label>
        {#if $teamsProjectionScope.error}<p class="schedule-error" role="alert">{$teamsProjectionScope.error}</p>{/if}
        <label class="schedule-field">Location <span>Optional</span><input type="text" aria-label="Location" bind:value={location} maxlength="500" placeholder="Add a location" /></label>
        {:else if currentStep === 4}
          <label class="crm-ui-label block">Attach to a season <span class="font-normal text-gray-500">Optional</span><select bind:value={seasonId} class="crm-ui-input mt-2"><option value={null}>No season</option>{#each eligibleSeasons as season}<option value={String(season.id)}>{season.name || season.title || 'Season name unavailable'}</option>{/each}</select></label>
          {#if seasonId}<div class="rounded-xl bg-[var(--crm-brand-surface)] p-4 text-sm text-[var(--crm-on-brand-surface)]"><strong>Included with the season</strong><p class="mt-2">Only covered season participants can register. No additional event charge.</p></div><label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={extraForm} />Collect an additional form</label>
          {:else}<EventPaymentTermsEditor currency="USD" bind:price bind:choice={paymentChoice} bind:installmentCount bind:cadence={installmentCadence} />{/if}
          {#if !seasonId || extraForm}<label class="crm-ui-label block">Registration form<select bind:value={selectedFormId} on:change={handleFormSelectionChange} class="crm-ui-input mt-2"><option value="" disabled={!seasonId && Number(price) > 0}>{!seasonId && Number(price) > 0 ? 'Choose a registration form' : 'No new form needed'}</option>{#each registrationForms as form}<option value={form.id}>{form.title}</option>{/each}<option value="CREATE_NEW">+ Create a new form</option></select></label>{/if}
          {#if registrationFormsError}<p class="text-sm text-red-700" role="alert">{registrationFormsError}</p>{/if}
          <ImageFilePicker inputId="event-create-image" label="Cover image (Optional)" currentUrl={coverPreviewUrl} photo bind:selectedFile={imageFile} bind:validationMessage={imageValidationMessage} disabled={submitState === 'loading'} />
          <label class="crm-ui-label block">Notes <span class="font-normal text-gray-500">Optional</span><textarea bind:value={notes} maxlength="5000" rows="2" class="crm-ui-input mt-2"></textarea></label>
        {:else}
          <ScheduleOccurrenceEditor dates={selectedDateKeys} slots={timeSlots} {title} {location} bind:overrides={occurrenceOverrides} />
          <details class="schedule-extra"><summary>App preview</summary><EventCreationPreview {title} type={eventType} team={teams.find((team) => team.id === selectedTeamId)?.name || ''} dates={selectedDateKeys} slots={timeSlots} {location} {notes} imageUrl={coverPreviewUrl} seasonName={eligibleSeasons.find((season) => String(season.id) === seasonId)?.name || eligibleSeasons.find((season) => String(season.id) === seasonId)?.title || ''} price={Number(price)} installments={paymentChoice === 'installments' ? installmentCount : 1} cadence={installmentCadence} registration={Boolean(selectedFormId && (!seasonId || extraForm))} /></details>
        {/if}

      </div>
      {#if errorMessage}<p class="schedule-error" role="alert">{errorMessage}</p>{/if}
    </fieldset>
  </div>
  {#if currentStep > 1}<footer class="schedule-create-footer"><div>{#if currentStep < 5}<button type="button" class="crm-auth-button-primary" disabled={submitState === 'loading'} on:click={handleNext}>{['', 'Next: Name', 'Next: Details', 'Review schedule'][currentStep - 1]}</button>{:else}<StatusButton state={submitState} on:click={handleSave} idleText="Save draft" loadingText="Saving…" successText="Saved" errorText="Retry save" class="crm-auth-button-primary" />{/if}</div></footer>{/if}
</div>
</div>
{#if showCreateForm}<CreateRegistrationForm previewEvent={{ title, date: selectedDateKeys[0] ? new Date(`${selectedDateKeys[0]}T${timeSlots[0]?.startTime || '00:00'}:00`).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '', price: seasonId ? 'Included with season' : Number(price) > 0 ? `$${Number(price).toFixed(2)}` : 'Free', imageUrl: coverPreviewUrl }} on:success={handleRegistrationCreated} on:cancel={() => showCreateForm = false} />{/if}
