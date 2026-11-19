<script lang="ts">
  import { RegistrationService } from '../../../lib/services/RegistrationService';
  import RegistrationMethodPicker from './RegistrationMethodPicker.svelte';
  import { eventCurrency, eventPriceCents } from '../../../lib/ui/eventMoney';
  import { programTermsStore } from '../../../lib/crm/programVocabulary';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { seasonsStore } from '../../../lib/services/DataStore';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type CrmEventOccurrenceInput } from '../../../lib/api/BackendApi';
  import StatusButton from '../ui/StatusButton.svelte';
  import ImageFilePicker from '../ui/ImageFilePicker.svelte';
  import { validateImageFile } from '../../../lib/media/imageUpload';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { teamReferenceMatches, type TeamReferenceIndex } from '../../../lib/ui/teamReferences';
  import EventEditDetail from './EventEditDetail.svelte';
  import EventPaymentTermsEditor from '../billing/EventPaymentTermsEditor.svelte';

  export let event: any = null;
  export let teams: Record<string, string> = {};
  export let teamReferences: TeamReferenceIndex = new Map();
  export let seriesSize = 0;
  export let projectionComplete = true;
  export let defaultApplyToSeries = false;

  const dispatch = createEventDispatcher();

  function displayTime(value: string) {
    return new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  $: seasonName = $seasonsStore.find((season) => String(season.id) === seasonId)?.name
    || $seasonsStore.find((season) => String(season.id) === seasonId)?.title
    || (seasonId ? 'Current season unavailable' : 'No season');
  $: scheduleSummary = rawDate && rawTime && rawEndTime
    ? `${new Date(`${rawDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}\n${displayTime(rawTime)}–${displayTime(rawEndTime)}`
    : 'Date or time not set';
  $: priceSummary = seasonCoverage ? 'Included in season enrollment'
    : !currency ? 'Currency unavailable' : price === '' || !Number.isFinite(Number(price)) || Number(price) < 0 ? 'Price unavailable'
    : Number(price) === 0 ? 'Free · ' + new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(0)
    : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(price));

  let title = event ? event.title || '' : '';
  let location = event ? event.location || '' : '';
  const originalTeamId = String(event?.teamId || '');
  // Resolve the displayed option only; unchanged writes retain the stored alias.
  let teamId = teamReferences.get(originalTeamId)?.documentId || originalTeamId;
  const originalSelectedTeamId = teamId;
  const originalLocation = location;
  const originalSeasonId = String(event?.seasonId || '');
  const originalSeasonCoverage = event?.seasonCoverage === true;
  let seasonId = originalSeasonId;
  $: seasonCoverage = Boolean(seasonId);
  $: seasonChanged = seasonId !== originalSeasonId || seasonCoverage !== originalSeasonCoverage;
  $: availableSeasons = $seasonsStore.filter((season) => ['active', 'upcoming'].includes(String(season.status || '')) && (!season.teamId || ['all', 'program', 'general'].includes(String(season.teamId)) || teamReferenceMatches(teamReferences, season.teamId, teamId)));
  let registrationMethod: 'form' | 'easy' = event?.registrationMethod === 'easy' ? 'easy' : 'form';
  let selectedFormId = String(event?.registrationFormId || '');
  let forms: any[] = [];
  let formsTenant = '';
  let unsubscribeForms = () => {};
  let formsError = '';
  $: if (formsTenant !== ($tenantIdStore || '')) {
    formsTenant = $tenantIdStore || ''; unsubscribeForms(); forms = []; formsError = '';
    const tenant = formsTenant;
    unsubscribeForms = tenant ? RegistrationService.subscribeToForms(tenant, rows => {
      if (formsTenant === tenant) forms = rows.filter(row => ['active', 'open'].includes(String(row.rawStatus || row.status || '').toLowerCase()));
    }, () => { if (formsTenant === tenant) formsError = 'Registration forms could not be loaded.'; }) : () => {};
  }
  let lifecycleStatus = event ? event.lifecycleStatus || 'draft' : 'draft';
  let imageUrl = event ? event.imageUrl || '' : '';
  let imageFile: File | null = null;
  let imageValidationMessage = '';
  const currency = eventCurrency(event);
  const originalPriceCents = eventPriceCents(event);
  let price = originalPriceCents === null ? '' : (originalPriceCents / 100).toFixed(2);
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
  const initialSchedule = { rawDate, rawTime, rawEndTime };
  const initialPayment = JSON.stringify({ price, paymentChoice, installmentCount, installmentCadence, cancellationPolicy, refundPolicy });
  $: paymentChanged = seasonChanged || initialPayment !== JSON.stringify({ price, paymentChoice, installmentCount, installmentCadence, cancellationPolicy, refundPolicy });
  let applyToSeries = defaultApplyToSeries && Boolean(event?.eventSeriesId);
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
    registrationMethod,
    selectedFormId,
    imageUrl: imageUrl.trim(),
    imageFile: imageFile
      ? { name: imageFile.name, type: imageFile.type, size: imageFile.size }
      : null,
    rawDate,
    rawTime,
    rawEndTime,
    applyToSeries,
    seasonId,
    seasonCoverage,
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
    unsubscribeForms();
  });

  function handleClose() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    dispatch('cancel');
  }

  async function handleSave() {
    if (submitState === 'loading' || !event?.id) return;
    if (registrationMethod === 'form' && event?.registrationMethod === 'easy' && !selectedFormId && !event?.registrationFormConfig?.sections?.length) { errorMessage = 'Choose a registration form.'; return; }
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
    if (paymentChanged && !currency && !seasonCoverage) {
      errorMessage = 'The event currency is unavailable or conflicting. Payment settings cannot be changed.';
      return;
    }
    if (paymentChanged && !seasonCoverage && !/^\d+(\.\d{1,2})?$/.test(price.trim())) {
      errorMessage = 'Enter a valid registration price with no more than two decimal places.';
      return;
    }
    const priceCents = seasonCoverage ? 0 : Math.round(Number(price) * 100);
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
        applyToSeries: applyToSeries && Boolean(event.eventSeriesId),
      };
      if (registrationMethod !== (event.registrationMethod || 'form')) update.registrationMethod = registrationMethod;
      if (registrationMethod === 'form' && selectedFormId !== String(event.registrationFormId || '')) update.registrationFormId = selectedFormId || null;
      if (seasonChanged) { update.seasonId = seasonId || null; update.seasonCoverage = seasonCoverage; }
      if (location !== originalLocation) update.location = location.trim();
      if (teamId !== originalSelectedTeamId) update.teamId = teamId;
      // The API requires this atomic block, but ordinary edits must preserve
      // versioned terms and policies without rewriting them.
      if (paymentChanged) Object.assign(update, {
        priceCents,
        paymentTerms: {
          mode: seasonCoverage ? 'pay_in_full' : paymentChoice,
          adminChoiceConfirmed: true,
          installmentCount: !seasonCoverage && paymentChoice === 'installments' ? installmentCount : 1,
          cadence: !seasonCoverage && paymentChoice === 'installments' ? installmentCadence : null,
          currency: (currency || 'USD').toLowerCase(),
        },
        paymentPolicies: priceCents > 0 && cancellationPolicy && refundPolicy ? { cancellation: cancellationPolicy, refund: refundPolicy } : null,
      });
      if (lifecycleStatus !== originalLifecycleStatus) {
        update.lifecycleStatus = lifecycleStatus;
      }
      if (uploadedImage) {
        update.imageReservationId = uploadedImage.reservationId;
      }
      const scheduleChanged = rawDate !== initialSchedule.rawDate
        || rawTime !== initialSchedule.rawTime || rawEndTime !== initialSchedule.rawEndTime;
      if (!update.applyToSeries && scheduleChanged) {
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
      errorMessage = 'The event could not be updated.';
      submitState = 'error';
    }
  }
</script>

<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="event-edit-stage">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel event editing" tabindex="-1" on:click={handleClose}></button>
    <div class="event-edit-panel" tabindex="-1" use:modalFocus={{ onEscape: handleClose }}>
      <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0">
        <header class="event-edit-header">
          <div class="event-edit-title-row">
            <button type="button" on:click={handleClose} aria-label="Back to Schedule" class="event-edit-back"><span aria-hidden="true">←</span> Schedule</button>
            <h3 id="modal-title">Edit {$programTermsStore.singular}</h3>
          </div>
          <p>{title || 'Untitled event'}</p>
        </header>
        <div class="event-edit-body">
          <ImageFilePicker inputId="event-edit-image" label="Cover image" photo compact currentUrl={imageUrl} previewAlt="Event image" bind:selectedFile={imageFile} bind:validationMessage={imageValidationMessage} disabled={submitState === 'loading'} />
          <section class="event-edit-section" aria-label="Event details">
            <h4>Event details</h4>
            <EventEditDetail id="event-edit-title-fields" label="Event title" value={title}>
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

            </EventEditDetail>
            <EventEditDetail id="event-edit-schedule-fields" label="Date & time" kind="calendar" value={scheduleSummary}>
        <!-- Date & Time -->
        <div class="event-schedule-fields">
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

            </EventEditDetail>
            <EventEditDetail id="event-edit-location-fields" label="Location" value={location}>
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

            </EventEditDetail>
            <EventEditDetail id="event-edit-settings-fields" label="Team & status" kind="layers" value={`${teams[teamId] || 'Team unavailable'} · ${lifecycleStatus}`}>
        <!-- Team Assignment & Status -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="team-select" class="crm-ui-label-caps">Assigned {$programTermsStore.group}</label>
            <select
              id="team-select"
              bind:value={teamId}
              class="crm-ui-input-teal"
            >
              <option value="" disabled>Select a {$programTermsStore.group.toLowerCase()}</option>
              {#if originalSelectedTeamId && !Object.hasOwn(teams, originalSelectedTeamId)}
                <option value={originalSelectedTeamId} disabled>Team unavailable</option>
              {/if}
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

            </EventEditDetail>
          </section>
          <section class="event-edit-section" aria-label="Registration">
            <h4>Registration</h4>
            <EventEditDetail id="event-edit-price-fields" label="Registration cost" kind="ticket" value={priceSummary}>
        {#if seasonCoverage}<div class="rounded-lg bg-[var(--crm-brand-surface)] p-4 text-sm text-[var(--crm-on-brand-surface)]">Only covered season participants can register. No additional event charge.</div>{:else}<EventPaymentTermsEditor {currency} bind:price bind:choice={paymentChoice} bind:installmentCount bind:cadence={installmentCadence} />{/if}

            </EventEditDetail>
            <EventEditDetail id="event-edit-season-fields" label="Season" kind="layers" value={seasonName}>
        <label class="crm-ui-label block">Attach to a season <span class="font-normal text-gray-500">Optional</span><select class="crm-ui-input mt-2" bind:value={seasonId}><option value="">No season</option>{#if originalSeasonId && !availableSeasons.some((season) => String(season.id) === originalSeasonId)}<option value={originalSeasonId} disabled>Current season unavailable</option>{/if}{#each availableSeasons as season}<option value={String(season.id)}>{season.name || season.title}</option>{/each}</select></label>
            </EventEditDetail>
            <EventEditDetail id="event-edit-method-fields" label="Registration method" kind="ticket" value={registrationMethod === 'easy' ? 'Easy registration' : 'Registration form'}>
        <RegistrationMethodPicker bind:value={registrationMethod} />
        {#if registrationMethod === 'form' && event?.registrationMethod === 'easy'}
          <label class="crm-ui-label block">Registration form<select class="crm-ui-input mt-2" bind:value={selectedFormId}><option value="">Choose a form</option>{#each forms as form}<option value={form.id}>{form.title}</option>{/each}</select></label>
          {#if formsError}<p role="alert">{formsError}</p>{/if}
        {/if}
            </EventEditDetail>
          </section>
        {#if publishConfirmationRequired}
          <div class="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p class="text-sm font-semibold text-amber-950">
              Publishing makes the event visible to its configured audience.
            </p>
            <p class="mt-1 text-xs text-amber-900">
              {applyToSeries
                ? `This will publish every loaded occurrence in the series (${seriesSize} shown).`
                : 'This publishes only this event occurrence.'}
              Organization visibility and membership settings still apply.
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
                <span class="text-sm font-semibold text-gray-900">Apply to the entire repeating event</span>
                <p class="crm-ui-hint-xs">Update the event settings across every scheduled date.</p>
              </div>
            </label>
          </div>
        {/if}

        {#if errorMessage}
          <div class="crm-ui-danger" role="alert">
            {errorMessage}
          </div>
        {/if}
        </div>
      <div class="event-edit-actions">
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

<style>
  .event-edit-stage{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px 90px}
  .event-edit-panel{position:relative;z-index:1;width:100%;max-width:520px;overflow:hidden;border:1px solid var(--crm-brand-border);border-radius:20px;background:#f3f6fa;color:#17263b;box-shadow:0 24px 64px #07172b40;text-align:left}
  .event-edit-header{padding:8px 18px 13px;background:linear-gradient(130deg,var(--crm-brand-sidebar),var(--crm-brand-primary));color:var(--crm-on-sidebar,#fff);border-bottom:1px solid var(--crm-brand-border)}
  .event-edit-title-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.event-edit-title-row h3{font-size:20px;font-weight:700;text-align:right}.event-edit-back{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px}.event-edit-header p{font-size:13px;opacity:.85;overflow-wrap:anywhere}
  .event-edit-body{display:grid;gap:16px;padding:18px 16px}.event-edit-section{background:#fff;border:1px solid #dce3ec;border-radius:16px;overflow:hidden}.event-edit-section h4{padding:13px 15px;background:#edf3f9;font-size:16px;font-weight:600;color:var(--crm-brand-link)}
  .event-schedule-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.event-schedule-fields>div:first-child{grid-column:1/-1}.event-schedule-fields :global(input){min-width:0;width:100%;box-sizing:border-box}
  .event-edit-actions{display:flex;gap:10px;padding:14px 16px;background:#fff;border-top:1px solid #dce3ec}.event-edit-actions :global(button){min-height:44px}.event-edit-actions :global(button:first-child){flex:1}.event-edit-actions :global(button:last-child){flex:1.6}
  .event-edit-back:focus-visible{outline:2px solid var(--crm-brand-border);outline-offset:2px}
  @media(max-width:380px){.event-edit-stage{padding:12px 8px 90px}.event-edit-body{padding:15px 12px}.event-edit-title-row h3{font-size:18px}}
</style>
