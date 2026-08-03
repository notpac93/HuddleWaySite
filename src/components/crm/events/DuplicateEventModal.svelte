<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey, type CrmEventOccurrenceInput } from '../../../lib/api/BackendApi';
  import RecurrenceSelector from './RecurrenceSelector.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  type DuplicableEvent = {
    id: string;
    title: string;
    dateObj?: Date | null;
    endDateObj?: Date | null;
    dateKey?: string;
    time?: string;
    location?: string;
    imageUrl?: string;
    teamId?: string | null;
    eventSeriesId?: string | null;
    type?: string;
    notes?: string;
    seasonId?: string | null;
    registrationFormId?: string | null;
    isRegistrationEnabled?: boolean;
  };

  export let event: DuplicableEvent | null = null;
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  let selectedDateKeys: string[] = [];
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let saveError = '';
  const automaticAuditReason = 'Event dates added from CRM.';
  let auditReason = automaticAuditReason;
  let operationKey = createIdempotencyKey('event-duplicate');
  let payloadSignature = '';
  let currentPayloadSignature = '';
  let openIdentity = '';
  let operationGeneration = 0;
  let originalStartTime = '';

  let timeSlots = [{ startTime: '16:00', endTime: '18:00' }];
  let showTimes = false;

  $: if (isOpen && event && openIdentity !== event.id) {
    openIdentity = event.id;
    selectedDateKeys = [];
    submitState = 'idle';
    saveError = '';
    auditReason = automaticAuditReason;
    showTimes = false;
    if (event.dateObj instanceof Date) {
      originalStartTime = event.dateObj.toTimeString().slice(0, 5);
    } else if (event.time) {
      let h = parseInt(event.time);
      if (event.time.toLowerCase().includes('pm') && h < 12) h += 12;
      if (event.time.toLowerCase().includes('am') && h === 12) h = 0;

      const parts = event.time.split(':');
      let m = '00';
      if (parts.length > 1) {
        m = parts[1].replace(/[^0-9]/g, '');
      }

      originalStartTime = `${h.toString().padStart(2, '0')}:${m}`;
    } else {
      originalStartTime = '16:00';
    }
    const originalEndTime = event.endDateObj instanceof Date
      ? event.endDateObj.toTimeString().slice(0, 5)
      : '';
    timeSlots = [{
      startTime: originalStartTime,
      endTime: originalEndTime > originalStartTime
        ? originalEndTime
        : `${Math.min(Number(originalStartTime.slice(0, 2)) + 2, 23)}:${originalStartTime.slice(3)}`.padStart(5, '0'),
    }];
  }
  $: if (!isOpen) openIdentity = '';
  $: currentPayloadSignature = JSON.stringify({
    eventId: event?.id || '',
    tenantId: $tenantIdStore,
    selectedDateKeys,
    timeSlots,
    auditReason: auditReason.trim(),
  });
  $: {
    const signature = currentPayloadSignature;
    if (signature !== payloadSignature && submitState !== 'loading') {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('event-duplicate');
      if (submitState === 'error') submitState = 'idle';
      saveError = '';
    } else if (signature !== payloadSignature) {
      payloadSignature = signature;
      operationKey = createIdempotencyKey('event-duplicate');
      operationGeneration += 1;
      submitState = 'error';
      saveError =
        'The organization or event details changed while saving. Review the dates and try again.';
    }
  }

  onDestroy(() => {
    operationGeneration += 1;
  });

  function formatTime12hr(time24: string) {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    let hours = parseInt(h);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${m} ${ampm}`;
  }

  function closeModal() {
    if (submitState === 'loading') return;
    operationGeneration += 1;
    selectedDateKeys = [];
    saveError = '';
    auditReason = automaticAuditReason;
    submitState = 'idle';
    showTimes = false;
    dispatch('close');
  }

  function occurrenceInput(dateKey: string, startTime: string, endTime: string): CrmEventOccurrenceInput {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startAt = new Date(`${dateKey}T${startTime}:00`);
    const endAt = new Date(`${dateKey}T${endTime}:00`);
    if (
      !timeZone
      || Number.isNaN(startAt.getTime())
      || Number.isNaN(endAt.getTime())
      || localDateKey(startAt) !== dateKey
      || localDateKey(endAt) !== dateKey
      || startAt.toTimeString().slice(0, 5) !== startTime
      || endAt.toTimeString().slice(0, 5) !== endTime
    ) {
      throw new Error('Your browser could not resolve the selected date, time, and time zone.');
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

  function localDateKey(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  async function handleDuplicate() {
    if (!event || submitState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      saveError = 'Select an organization before adding event dates.';
      return;
    }
    if (!event.teamId || event.teamId === 'general') {
      saveError = 'Assign the original event to a team before adding dates.';
      return;
    }

    if (selectedDateKeys.length === 0) {
      saveError = 'Please select at least one date.';
      return;
    }
    const uniqueTimeSlots = new Set(
      timeSlots.map(({ startTime, endTime }) => `${startTime}-${endTime}`),
    );
    if (uniqueTimeSlots.size !== timeSlots.length) {
      saveError = 'Remove duplicate event time slots before adding dates.';
      return;
    }
    if (selectedDateKeys.length * timeSlots.length > 200) {
      saveError = 'Add at most 200 event occurrences at a time.';
      return;
    }

    const eventId = event.id;
    const generation = ++operationGeneration;
    const submittedSignature = currentPayloadSignature;
    if (submittedSignature !== payloadSignature) {
      payloadSignature = submittedSignature;
      operationKey = createIdempotencyKey('event-duplicate');
    }
    const idempotencyKey = operationKey;
    submitState = 'loading';
    saveError = '';

    try {
      const originalDateKey = event.dateKey
        || (event.dateObj instanceof Date ? localDateKey(event.dateObj) : '');

      const occurrences: CrmEventOccurrenceInput[] = [];

      for (const dateKey of selectedDateKeys) {
        for (const slot of timeSlots) {
          if (!slot.startTime || !slot.endTime || slot.endTime <= slot.startTime) {
            throw new Error('Each event end time must be later than its start time.');
          }
          // Skip if duplicating to the exact same date and time as the original event
          if (dateKey === originalDateKey && slot.startTime === originalStartTime) continue;

          occurrences.push(occurrenceInput(dateKey, slot.startTime, slot.endTime));
        }
      }

      if (occurrences.length === 0) {
        saveError = 'Please select dates other than the current event date.';
        submitState = 'idle';
        return;
      }
      await backendClient.duplicateEvent(
        tenantId,
        eventId,
        occurrences,
        auditReason.trim(),
        idempotencyKey,
      );
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(event?.id || '') !== eventId
        || payloadSignature !== submittedSignature
      ) return;
      submitState = 'success';
      dispatch('duplicated');
      closeModal();

    } catch (err: unknown) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(event?.id || '') !== eventId
        || payloadSignature !== submittedSignature
      ) return;
      const supportId = err instanceof BackendApiError ? err.requestId : null;
      console.error('Event duplication failed.', {
        requestId: supportId || 'unavailable',
      });
      saveError = `The draft event dates could not be added.${supportId ? ` Support request: ${supportId}` : ''}`;
      submitState = 'error';
    }
  }

</script>

{#if isOpen && event}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
    <button type="button" disabled={submitState === 'loading'} class="crm-ui-backdrop" aria-label="Cancel event duplication" tabindex="-1" on:click={closeModal}></button>

    <div
      class="crm-ui-event-duplicate-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      use:modalFocus={{ onEscape: closeModal }}
    >
      <fieldset disabled={submitState === 'loading'} class="m-0 min-w-0 border-0 p-0">

      <div class="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
        <button type="button" disabled={submitState === 'loading'} class="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50" on:click={closeModal}>
          <span class="sr-only">Close</span>
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="sm:flex sm:items-start w-full">
        <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
          <h3 class="text-xl font-semibold leading-6 text-gray-900" id="modal-title">
            Add More Dates to "{event.title}"
          </h3>
          <p class="crm-ui-notice-card mt-2">
            Added dates are created as drafts. Publishing requires a separate reviewed action and consumer page synchronization.
          </p>

          <div class="mt-6">
            <RecurrenceSelector bind:selectedDateKeys />
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
                      <label for="dup-start-time-{index}" class="crm-ui-label">Start Time</label>
                      <input type="time" id="dup-start-time-{index}" bind:value={slot.startTime} class="crm-ui-input-teal-block">
                    </div>
                    <div class="flex-1">
                      <label for="dup-end-time-{index}" class="crm-ui-label">End Time</label>
                      <input type="time" id="dup-end-time-{index}" bind:value={slot.endTime} class="crm-ui-input-teal-block">
                    </div>
                  </div>
                {/each}
              </div>
              <button type="button" on:click={() => timeSlots = [...timeSlots, { startTime: '16:00', endTime: '18:00' }]} class="crm-ui-event-link mt-3">
                + Add another time
              </button>
            </div>
          {/if}

          {#if saveError}
            <div class="crm-ui-danger mt-4">
              {saveError}
            </div>
          {/if}

        </div>
      </div>

      <div class="mt-5 sm:mt-8 sm:flex sm:flex-row-reverse w-full px-4">
        <StatusButton
          type="button"
          state={submitState}
          on:click={handleDuplicate}
          disabled={selectedDateKeys.length === 0 || submitState === 'loading'}
          idleText="Add Dates"
          loadingText="Saving..."
          successText="Added!"
          errorText="Retry Add Dates"
          class="crm-ui-event-duplicate-primary"
        />
        <button
          type="button"
          disabled={submitState === 'loading'}
          class="crm-ui-event-duplicate-secondary"
          on:click={closeModal}
        >
          Cancel
        </button>
      </div>
      </fieldset>

    </div>
  </div>
{/if}
