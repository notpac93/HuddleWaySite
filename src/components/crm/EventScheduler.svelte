<script lang="ts">
  import {
    DataStore,
    eventsProjectionScope,
    eventsStore,
    registrationsProjectionScope,
    registrationsStore,
    teamsProjectionScope,
    teamsStore,
  } from '../../lib/services/DataStore';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import { onDestroy, tick } from 'svelte';
  import CreateEventForm from './events/CreateEventForm.svelte';
  import EditEventModal from './events/EditEventModal.svelte';
  import DuplicateEventModal from './events/DuplicateEventModal.svelte';
  import EventRegistrantsModal from './events/EventRegistrantsModal.svelte';
  import StatusButton from './ui/StatusButton.svelte';

  export let activeTeam: string | { id?: unknown } | null = null;
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};

  let events: any[] = [];
  let isCreateFormOpen = false;
  let isDuplicateModalOpen = false;
  let showRegistrantsForEvent = null;
  let eventToDuplicate: any = null;
  let editingEvent: any = null;
  let expandedEventId: string | null = null;

  let inlineEditTitle = '';
  let inlineEditLocation = '';
  let inlineEditTeamId = 'general';
  let inlineEditStatus = 'published';
  let inlineEditDate = '';
  let inlineEditTime = '16:00';
  let inlineEditEndTime = '18:00';
  let inlineEditApplyToSeries = false;
  let inlineAuditReason = '';
  let inlineSaveState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let inlineError = '';
  let inlineRequestId = '';
  let inlineOperationKey = '';
  let inlinePayloadSignature = '';
  let currentInlinePayloadSignature = '';
  let inlineOperationGeneration = 0;
  let originalInlineStatus = '';
  let inlinePublishConfirmation = '';

  let activeTab = 'Upcoming'; // 'Upcoming' or 'Past'
  let teams: Record<string, string> = {};
  let consumedTargetId = '';
  const eventLifecycleStatuses = new Set(['draft', 'published', 'archived']);
  const MAX_SERIES_UPDATE_COUNT = 400;
  const publishConfirmationText = 'PUBLISH EVENT';

  function localDateKey(date: Date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function eventDateLabel(date: Date) {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function mapEvent(data: any) {
          let formattedDate = 'Date unavailable';
          let dateObj: Date | null = null;

          if (data.date) {
            if (typeof data.date === 'string') {
              const parsed = new Date(data.date);
              if (!isNaN(parsed.getTime())) {
                dateObj = parsed;
                formattedDate = eventDateLabel(parsed);
              }
            } else if (data.date.toDate) {
              dateObj = data.date.toDate();
              formattedDate = eventDateLabel(dateObj);
            } else if (data.date.seconds) {
              dateObj = new Date(data.date.seconds * 1000);
              formattedDate = eventDateLabel(dateObj);
            }
          }
          const endDateObj = data.endDate?.toDate
            ? data.endDate.toDate()
            : data.endDate?.seconds
              ? new Date(data.endDate.seconds * 1000)
              : data.endDate
                ? new Date(data.endDate)
                : null;

          const storedLifecycleStatus = String(data.lifecycleStatus || '').toLowerCase();
          const lifecycleStatus = eventLifecycleStatuses.has(storedLifecycleStatus)
            ? storedLifecycleStatus
            : 'status_unavailable';

          return {
            id: String(data.id || '').trim(),
            title:
              typeof data.title === 'string' && data.title.trim()
                ? data.title.trim()
                : 'Event title unavailable',
            date: formattedDate,
            dateObj,
            endDateObj: endDateObj instanceof Date && !Number.isNaN(endDateObj.getTime()) ? endDateObj : null,
            dateKey: data.dateKey || (dateObj ? localDateKey(dateObj) : ''),
            time: dateObj ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '',
            location:
              typeof data.location === 'string' && data.location.trim()
                ? data.location.trim()
                : null,
            rsvps: data.rsvps || { going: 0, maybe: 0, out: 0 },
            lifecycleStatus,
            isDeleted: data.isDeleted === true,
            imageUrl: data.imageUrl || '',
            teamId: data.teamId || 'general',
            eventSeriesId: data.eventSeriesId || null,
            isMultiDateSeries: data.isMultiDateSeries || false,
            type:
              typeof data.type === 'string' && data.type.trim()
                ? data.type.trim()
                : null,
            notes: data.notes || '',
            seasonId: data.seasonId || null,
            registrationFormId: data.registrationFormId || null,
            isRegistrationEnabled: data.isRegistrationEnabled === true,
          };
  }

  $: teams = Object.fromEntries(
    $teamsStore.map((team) => [
      String(team.id),
      team.name || 'Team name unavailable',
    ]),
  );
  $: selectedTeamId = activeTeam
    ? String(
        typeof activeTeam === 'object'
          ? activeTeam.id ?? ''
          : activeTeam,
      ).trim()
    : '';
  $: mappedEvents = $eventsStore
    .filter((event) => !selectedTeamId || String(event.teamId) === selectedTeamId)
    .map(mapEvent)
    .filter((event) => !event.isDeleted);
  $: malformedEventCount = mappedEvents.filter((event) => !event.id).length;
  $: events = mappedEvents.filter((event) => Boolean(event.id));

  $: now = new Date();

  // Sort past events descending (newest past event first)
  $: pastEvents = events
    .filter(e => e.dateObj && e.dateObj < now)
    .sort((a, b) => b.dateObj - a.dateObj);

  // Sort upcoming events ascending (soonest event first)
  $: upcomingEvents = events
    .filter(e => !e.dateObj || e.dateObj >= now)
    .sort((a, b) => {
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj - b.dateObj;
    });

  $: visibleEvents = activeTab === 'Upcoming' ? upcomingEvents : pastEvents;
  $: publishConfirmationRequired =
    inlineEditStatus === 'published'
    && originalInlineStatus !== 'published';
  $: currentInlinePayloadSignature = JSON.stringify({
    tenantId: $tenantIdStore,
    eventId: expandedEventId || '',
    inlineEditTitle,
    inlineEditLocation,
    inlineEditTeamId,
    inlineEditStatus,
    inlineEditDate,
    inlineEditTime,
    inlineEditEndTime,
    inlineEditApplyToSeries,
    inlineAuditReason,
  });
  $: {
    const signature = currentInlinePayloadSignature;
    if (signature !== inlinePayloadSignature && inlineSaveState !== 'loading') {
      inlinePayloadSignature = signature;
      inlineOperationKey = createIdempotencyKey('event-inline-update');
      if (inlineSaveState === 'error') {
        inlineSaveState = 'idle';
        inlineError = '';
        inlineRequestId = '';
      }
    } else if (signature !== inlinePayloadSignature) {
      inlinePayloadSignature = signature;
      inlineOperationKey = createIdempotencyKey('event-inline-update');
      inlineOperationGeneration += 1;
      inlineSaveState = 'error';
      inlineError =
        'The organization or event details changed while saving. Review the event and try again.';
      inlineRequestId = '';
    }
  }
  $: if (!publishConfirmationRequired && inlinePublishConfirmation) {
    inlinePublishConfirmation = '';
  }

  $: if (activeResultId && activeResultId !== consumedTargetId) {
    const targetEvent = events.find((event) => String(event.id) === activeResultId);
    if (targetEvent) {
      const targetId = activeResultId;
      consumedTargetId = targetId;
      activeTab = targetEvent.dateObj && targetEvent.dateObj < now ? 'Past' : 'Upcoming';
      toggleExpand(targetEvent);
      void tick().then(() => {
        const targetButton = Array.from(
          document.querySelectorAll<HTMLElement>('[data-event-record-id]'),
        ).find((element) => element.dataset.eventRecordId === targetId);
        targetButton?.scrollIntoView?.({ block: 'center' });
        targetButton?.focus();
        onTargetConsumed(targetId);
      });
    }
  }
  $: if (!activeResultId) consumedTargetId = '';

  const defaultFallbackImage = '/crm-event-placeholder.svg';

  function handleImgError(event: Event) {
    const img = event.currentTarget as HTMLImageElement;
    if (img && img.dataset.fallbackApplied !== 'true') {
      img.dataset.fallbackApplied = 'true';
      img.src = defaultFallbackImage;
    }
  }

  function handleCreateEventSuccess() {
    isCreateFormOpen = false;
  }

  function toggleExpand(evt: any) {
    if (inlineSaveState === 'loading') return;
    if (expandedEventId === evt.id) {
      expandedEventId = null;
      inlineEditApplyToSeries = false;
    } else {
      expandedEventId = evt.id;
      inlineEditApplyToSeries = false;
      inlineEditTitle = evt.title || '';
      inlineEditLocation = evt.location || '';
      inlineEditTeamId = evt.teamId || 'general';
      inlineEditStatus = evt.lifecycleStatus || 'published';
      originalInlineStatus = evt.lifecycleStatus || '';
      inlineEditDate = evt.dateObj
        ? localDateKey(new Date(evt.dateObj))
        : '';
      inlineEditTime = evt.dateObj
        ? new Date(evt.dateObj).toTimeString().slice(0, 5)
        : '';
      inlineEditEndTime = evt.endDateObj
        ? new Date(evt.endDateObj).toTimeString().slice(0, 5)
        : '';
      inlineAuditReason = '';
      inlinePublishConfirmation = '';
      inlineSaveState = 'idle';
      inlineError = '';
      inlineRequestId = '';
    }
  }

  function openDuplicateModal(event: any) {
    if (inlineSaveState === 'loading') return;
    eventToDuplicate = { ...event };
    isDuplicateModalOpen = true;
  }

  async function saveInlineEdit(evt: any) {
    if (inlineSaveState === 'loading') return;
    const tenantId = $tenantIdStore;
    if (!tenantId) {
      failInlineEdit('Select an organization before editing events.');
      return;
    }
    if (!eventLifecycleStatuses.has(inlineEditStatus)) {
      failInlineEdit('Choose a valid event lifecycle status.');
      return;
    }
    const sameSeriesCount = evt.eventSeriesId
      ? events.filter((event) => event.eventSeriesId === evt.eventSeriesId).length
      : 0;
    if (
      inlineEditApplyToSeries
      && (
        $eventsProjectionScope.truncated
        || sameSeriesCount > MAX_SERIES_UPDATE_COUNT
      )
    ) {
      failInlineEdit(
        `Series updates require a complete series of at most ${MAX_SERIES_UPDATE_COUNT} events.`,
      );
      return;
    }
    if (!inlineEditTitle.trim() || !inlineEditDate || !inlineEditTime || !inlineEditEndTime || !inlineEditTeamId || inlineEditTeamId === 'general') {
      failInlineEdit(
        'Event title, date, start time, end time, and team are required.',
      );
      return;
    }
    if (inlineEditEndTime <= inlineEditTime) {
      failInlineEdit('Event end time must be later than its start time.');
      return;
    }
    if (inlineAuditReason.trim().length < 3) {
      failInlineEdit('Provide a reason for this event change.');
      return;
    }
    if (
      publishConfirmationRequired
      && inlinePublishConfirmation !== publishConfirmationText
    ) {
      failInlineEdit(
        `Type ${publishConfirmationText} before publishing this event.`,
      );
      return;
    }
    const eventId = String(evt.id || '');
    if (!eventId) {
      failInlineEdit('This event record is missing its identifier and cannot be updated.');
      return;
    }
    const generation = ++inlineOperationGeneration;
    const submittedSignature = currentInlinePayloadSignature;
    if (submittedSignature !== inlinePayloadSignature) {
      inlinePayloadSignature = submittedSignature;
      inlineOperationKey = createIdempotencyKey('event-inline-update');
    }
    const idempotencyKey = inlineOperationKey;
    inlineSaveState = 'loading';
    inlineError = '';
    inlineRequestId = '';
    try {
      const update: Parameters<typeof backendClient.updateEvent>[2] = {
        title: inlineEditTitle.trim(),
        location: inlineEditLocation.trim(),
        teamId: inlineEditTeamId,
        applyToSeries: inlineEditApplyToSeries && Boolean(evt.eventSeriesId),
      };
      if (inlineEditStatus !== originalInlineStatus) {
        update.lifecycleStatus = inlineEditStatus;
      }
      if (!update.applyToSeries) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const startAt = new Date(`${inlineEditDate}T${inlineEditTime}:00`);
        const endAt = new Date(`${inlineEditDate}T${inlineEditEndTime}:00`);
        const startTimeRoundTrip = startAt.toTimeString().slice(0, 5);
        const endTimeRoundTrip = endAt.toTimeString().slice(0, 5);
        if (
          !timeZone
          || Number.isNaN(startAt.getTime())
          || Number.isNaN(endAt.getTime())
          || localDateKey(startAt) !== inlineEditDate
          || localDateKey(endAt) !== inlineEditDate
          || startTimeRoundTrip !== inlineEditTime
          || endTimeRoundTrip !== inlineEditEndTime
        ) {
          throw new Error('Your browser could not resolve the selected event date and time.');
        }
        Object.assign(update, {
          dateKey: inlineEditDate,
          startTime: inlineEditTime,
          endTime: inlineEditEndTime,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timeZone,
        });
      }
      await backendClient.updateEvent(
        tenantId,
        eventId,
        update,
        inlineAuditReason.trim(),
        idempotencyKey,
      );
      if (
        generation !== inlineOperationGeneration
        || $tenantIdStore !== tenantId
        || expandedEventId !== eventId
        || inlinePayloadSignature !== submittedSignature
      ) return;
      expandedEventId = null;
      inlineSaveState = 'success';
    } catch (err: unknown) {
      if (
        generation !== inlineOperationGeneration
        || $tenantIdStore !== tenantId
        || expandedEventId !== eventId
        || inlinePayloadSignature !== submittedSignature
      ) return;
      inlineRequestId =
        err instanceof BackendApiError ? err.requestId || '' : '';
      console.error('Inline event update failed.', {
        requestId: inlineRequestId || 'unavailable',
      });
      inlineError = 'The event could not be updated.';
      inlineSaveState = 'error';
    }
  }

  function failInlineEdit(message: string) {
    inlineSaveState = 'error';
    inlineError = message;
    inlineRequestId = '';
  }

  onDestroy(() => {
    inlineOperationGeneration += 1;
  });
</script>

{#if isCreateFormOpen}
  <CreateEventForm
    on:cancel={() => isCreateFormOpen = false}
    on:success={handleCreateEventSuccess}
  />
{/if}

{#if editingEvent}
  <EditEventModal
    bind:event={editingEvent}
    {teams}
    seriesSize={editingEvent.eventSeriesId
      ? events.filter((event) => event.eventSeriesId === editingEvent.eventSeriesId).length
      : 1}
    projectionComplete={!$eventsProjectionScope.truncated}
    on:cancel={() => editingEvent = null}
    on:success={() => editingEvent = null}
  />
{/if}

<DuplicateEventModal
  bind:event={eventToDuplicate}
  bind:isOpen={isDuplicateModalOpen}
  on:close={() => { isDuplicateModalOpen = false; eventToDuplicate = null; }}
/>

<div class="p-6 md:p-8 space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="crm-ui-page-title">Events</h2>
      <p class="mt-1 text-sm text-gray-500">Create drafts and manage authoritative event records.</p>
    </div>
    <button
      type="button"
      disabled={inlineSaveState === 'loading'}
      class="crm-ui-event-top-primary"
      on:click={() => isCreateFormOpen = true}
    >
      New event
    </button>
  </div>

  {#if $eventsProjectionScope.truncated || $teamsProjectionScope.truncated}
    <p class="crm-ui-notice-card" role="status">
      This view is limited to {$eventsProjectionScope.limit} events and {$teamsProjectionScope.limit} teams. Search, series validation, and counts may be incomplete.
    </p>
  {/if}
  {#if $registrationsProjectionScope.truncated}
    <p class="crm-ui-notice-card" role="status">
      Registration counts are unavailable because more than {$registrationsProjectionScope.limit} registration records exist.
    </p>
  {/if}
  {#if malformedEventCount > 0}
    <p class="crm-ui-notice-card" role="status">
      {malformedEventCount} malformed event {malformedEventCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.
    </p>
  {/if}

  <!-- Tabs -->
  <div class="border-b border-gray-200">
    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
      <button
        type="button"
      on:click={() => activeTab = 'Upcoming'}
        aria-pressed={activeTab === 'Upcoming'}
        class="crm-ui-event-tab {activeTab === 'Upcoming' ? 'crm-ui-event-tab-active' : 'crm-ui-event-tab-idle'}"
      >
        Upcoming Events
      </button>
      <button
        type="button"
      on:click={() => activeTab = 'Past'}
        aria-pressed={activeTab === 'Past'}
        class="crm-ui-event-tab {activeTab === 'Past' ? 'crm-ui-event-tab-active' : 'crm-ui-event-tab-idle'}"
      >
        Past Events
      </button>
    </nav>
  </div>

  {#if $eventsProjectionScope.loading || $teamsProjectionScope.loading}
    <div class="crm-ui-empty" role="status">Loading events…</div>
  {:else if $eventsProjectionScope.error || $teamsProjectionScope.error}
    <div class="crm-ui-danger" role="alert">
      {$eventsProjectionScope.error || $teamsProjectionScope.error}
    </div>
  {:else}
  <div class="grid gap-6">
    {#each visibleEvents as event (event.id)}
      <article class="crm-ui-event-card {activeResultId === String(event.id) ? 'ring-2 ring-[#00a4bd]' : ''}">
        <!-- Collapsed Summary Card -->
        <div class="crm-ui-event-card-summary">
          <div class="crm-ui-event-thumbnail">
            <img
              src={event.imageUrl || defaultFallbackImage}
              alt={event.title}
              width="128"
              height="96"
              loading="lazy"
              decoding="async"
              class="crm-ui-cover"
              on:error={handleImgError}
            />
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <h3 class="crm-ui-title">{event.title}</h3>
              {#if event.dateObj && event.dateObj < now}
                <span class="crm-ui-event-badge crm-ui-event-badge-expired">
                  Expired
                </span>
              {:else if event.lifecycleStatus === 'draft' || event.lifecycleStatus === 'archived'}
                <span class="crm-ui-event-badge crm-ui-event-badge-draft">
                  {event.lifecycleStatus === 'archived' ? 'Archived' : 'Draft'}
                </span>
              {:else if event.lifecycleStatus === 'published'}
                <span class="crm-ui-event-badge crm-ui-event-badge-published">
                  Published
                </span>
              {:else}
                <span class="crm-ui-event-badge crm-ui-event-badge-unavailable">Status unavailable</span>
              {/if}
            </div>
            <div class="crm-ui-event-meta">
              <span class="flex items-center text-[#00a4bd] font-semibold">
                <svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {teams[event.teamId] || (event.teamId === 'general' ? 'Program-wide event' : 'Team unavailable')}
              </span>
              <span class="crm-ui-center">
                <svg class="mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {event.date}
              </span>
              <span class="crm-ui-center">
                <svg class="mr-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.location || 'Location unavailable'}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-4">


            <div class="flex gap-3 border-l border-gray-200 pl-4">
              <button
                type="button"
                class="text-center pr-2 hover:bg-gray-50 p-1 rounded transition-colors"
                aria-label={$registrationsProjectionScope.truncated
                  ? `View loaded registrants for ${event.title}; exact count unavailable`
                  : `View ${DataStore.getEventRegistrationCount(event, $registrationsStore)} registrants for ${event.title}`}
                disabled={$registrationsProjectionScope.loading || Boolean($registrationsProjectionScope.error)}
                on:click={() => showRegistrantsForEvent = event}
              >
                <div class="text-lg font-bold text-green-600">
                  {$registrationsProjectionScope.truncated ? '—' : DataStore.getEventRegistrationCount(event, $registrationsStore)}
                </div>
                <div class="text-[10px] text-gray-500 uppercase font-semibold">Registered</div>
              </button>
            </div>

            <button
              type="button"
              class="crm-ui-button-secondary py-1.5 text-xs"
              disabled={inlineSaveState === 'loading'}
              on:click={() => { editingEvent = { ...event }; }}
            >
              Edit
            </button>

            <!-- Expand Chevron Icon -->
            <button
              type="button"
              data-event-record-id={event.id}
              class="crm-ui-event-icon-button"
              aria-label={`${expandedEventId === event.id ? 'Collapse' : 'Expand'} ${event.title}`}
              aria-expanded={expandedEventId === event.id}
              disabled={inlineSaveState === 'loading'}
              on:click={() => toggleExpand(event)}
            >
              <svg class="crm-ui-event-chevron {expandedEventId === event.id ? 'rotate-180 text-[#00a4bd]' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Expanded Inline Editor Drawer -->
        {#if expandedEventId === event.id}
          <div class="border-t border-gray-200 bg-slate-50 p-6 space-y-4">
            <fieldset disabled={inlineSaveState === 'loading'} class="m-0 min-w-0 space-y-4 border-0 p-0">
            <div class="crm-ui-between">
              <h4 class="text-sm font-bold text-gray-900 uppercase tracking-wider">Inline Event Editor & Media Controls</h4>

            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <!-- Column 1: Image Media Editor -->
              <div class="space-y-3">
                <p class="block text-xs font-semibold uppercase text-gray-700">Banner Image Graphic</p>
                <div class="crm-ui-event-banner">
                  <img
                    src={event.imageUrl || defaultFallbackImage}
                    alt="Inline Preview"
                    width="640"
                    height="288"
                    loading="lazy"
                    decoding="async"
                    class="crm-ui-cover"
                    on:error={handleImgError}
                  />
                </div>
                <div class="crm-ui-notice-sm">
                  Banner uploads are unavailable in this release. The existing event image is retained.
                </div>
              </div>

              <!-- Column 2: Event Details -->
              <div class="space-y-3 md:col-span-2">
                <div>
                  <label for={`inline-event-title-${event.id}`} class="crm-ui-label-caps-sm">Event Title</label>
                  <input
                    id={`inline-event-title-${event.id}`}
                    type="text"
                    bind:value={inlineEditTitle}
                    maxlength="200"
                    class="crm-ui-select-teal"
                  />
                </div>

                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for={`inline-event-date-${event.id}`} class="block text-xs font-semibold uppercase text-gray-700">Date</label>
                      <button type="button" on:click={() => openDuplicateModal(event)} class="text-[10px] font-semibold text-[#00a4bd] hover:text-[#007f91]">+ Add More Dates</button>
                    </div>
                    <input
                      id={`inline-event-date-${event.id}`}
                      type="date"
                      bind:value={inlineEditDate}
                      disabled={inlineEditApplyToSeries}
                      class="crm-ui-select-teal"
                    />
                  </div>
                  <div>
                    <label for={`inline-event-time-${event.id}`} class="crm-ui-label-caps-sm">Time</label>
                    <input
                      id={`inline-event-time-${event.id}`}
                      type="time"
                      bind:value={inlineEditTime}
                      disabled={inlineEditApplyToSeries}
                      class="crm-ui-select-teal"
                    />
                  </div>
                  <div>
                    <label for={`inline-event-end-time-${event.id}`} class="crm-ui-label-caps-sm">End time</label>
                    <input id={`inline-event-end-time-${event.id}`} type="time" bind:value={inlineEditEndTime} disabled={inlineEditApplyToSeries} class="crm-ui-select-teal disabled:bg-gray-100" />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for={`inline-event-location-${event.id}`} class="crm-ui-label-caps-sm">Location / Venue</label>
                    <input
                      id={`inline-event-location-${event.id}`}
                      type="text"
                      bind:value={inlineEditLocation}
                      maxlength="500"
                      class="crm-ui-select-teal"
                    />
                  </div>
                  <div>
                    <label for={`inline-event-team-${event.id}`} class="crm-ui-label-caps-sm">Assigned Team</label>
                    <select
                      id={`inline-event-team-${event.id}`}
                      bind:value={inlineEditTeamId}
                      class="crm-ui-select-teal"
                    >
                      <option value="" disabled>Select a team</option>
                      {#each Object.entries(teams) as [id, name]}
                        <option value={id}>{name}</option>
                      {/each}
                    </select>
                  </div>
                </div>

                <div>
                  <label for={`inline-event-status-${event.id}`} class="crm-ui-label-caps-sm">Publish Status</label>
                  <select
                    id={`inline-event-status-${event.id}`}
                    bind:value={inlineEditStatus}
                    class="crm-ui-select-teal"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    {#if inlineEditStatus === 'status_unavailable'}<option value="status_unavailable" disabled>Status unavailable</option>{/if}
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {#if publishConfirmationRequired}
                  <div class="rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p class="text-sm font-semibold text-amber-950">
                      Publishing makes the event visible to its configured audience.
                    </p>
                    <p class="mt-1 text-xs text-amber-900">
                      {inlineEditApplyToSeries
                        ? `This will publish every loaded occurrence in the series (${events.filter((candidate) => candidate.eventSeriesId === event.eventSeriesId).length} shown).`
                        : 'This publishes only this event occurrence.'}
                      Consumer event feeds read this authoritative published record directly; tenant visibility and membership rules still apply.
                    </p>
                    <label for={`inline-event-publish-confirmation-${event.id}`} class="mt-3 block text-xs font-medium text-amber-950">
                      Type <span class="font-semibold">{publishConfirmationText}</span>
                    </label>
                    <input
                      id={`inline-event-publish-confirmation-${event.id}`}
                      type="text"
                      bind:value={inlinePublishConfirmation}
                      autocomplete="off"
                      class="crm-ui-field border-amber-400"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Apply to Series Toggle -->
            {#if event.isMultiDateSeries && event.eventSeriesId}
              <div class="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <label class="flex items-center space-x-3 cursor-pointer">
                  <div class="relative">
                    <input type="checkbox" bind:checked={inlineEditApplyToSeries} class="sr-only" />
                    <div class="crm-ui-event-toggle-track {inlineEditApplyToSeries ? 'crm-ui-event-toggle-active' : ''}"></div>
                    <div class="crm-ui-event-toggle-dot {inlineEditApplyToSeries ? 'translate-x-4' : ''}"></div>
                  </div>
                  <div>
                    <span class="text-sm font-semibold text-gray-900">Apply to all events in this series</span>
                    <p class="crm-ui-hint-xs">Update title, location, team, and lifecycle status. Each occurrence keeps its existing date, time, and image.</p>
                  </div>
                </label>
              </div>
            {/if}

            <div>
              <label for={`inline-event-audit-reason-${event.id}`} class="crm-ui-label-caps-sm">Reason for change *</label>
              <input id={`inline-event-audit-reason-${event.id}`} type="text" bind:value={inlineAuditReason} minlength="3" maxlength="500" required class="crm-ui-field bg-white" placeholder="Why is this event being changed?">
            </div>

            {#if inlineError}
              <div class="crm-ui-danger" role="alert">
                <p>{inlineError}</p>
                {#if inlineRequestId}<p class="mt-1 text-xs">Support request: {inlineRequestId}</p>{/if}
              </div>
            {/if}

            <!-- Footer Action Buttons -->
            <div class="flex justify-end space-x-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                disabled={inlineSaveState === 'loading'}
                on:click={() => { expandedEventId = null; inlineEditApplyToSeries = false; }}
                class="crm-ui-event-action-secondary"
              >
                Close Drawer
              </button>
              <StatusButton
                state={inlineSaveState}
                on:click={() => saveInlineEdit(event)}
                disabled={
                  inlineAuditReason.trim().length < 3
                  || inlineSaveState === 'loading'
                  || (
                    publishConfirmationRequired
                    && inlinePublishConfirmation !== publishConfirmationText
                  )
                }
                idleText="Save Event Changes"
                loadingText="Saving Changes..."
                successText="Changes Saved"
                errorText="Retry Event Update"
                class="crm-ui-event-action-primary"
              />
            </div>
            </fieldset>
          </div>
        {/if}
      </article>
    {:else}
      <div class="crm-ui-empty">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No {activeTab.toLowerCase()} events</h3>
        <p class="mt-1 text-sm text-gray-500">Get started by creating a new event.</p>
        <div class="mt-6">
          <!-- We leave this button for the empty state just so it's not totally barren, but we can change it to say New Event -->
          <button on:click={() => isCreateFormOpen = true} type="button" class="crm-ui-event-top-primary">
            <svg class="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            New Event
          </button>
        </div>
      </div>
    {/each}
  </div>
  {/if}
</div>

{#if showRegistrantsForEvent}
  <EventRegistrantsModal
    event={showRegistrantsForEvent}
    registrations={$registrationsStore}
    incomplete={$registrationsProjectionScope.truncated}
    onClose={() => showRegistrantsForEvent = null}
  />
{/if}
