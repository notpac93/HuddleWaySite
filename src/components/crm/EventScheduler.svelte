<script lang="ts">
  import { toast } from './ui/toast';
  import { groupEventSeries } from '../../lib/ui/eventSeries';
  import { eventPriceCents, eventPriceLabel } from '../../lib/ui/eventMoney';
  import { programTermsStore } from '../../lib/crm/programVocabulary';
  import {
    DataStore,
    eventsProjectionScope,
    eventsStore,
    registrationsProjectionScope,
    registrationsStore,
    seasonsStore,
    teamsProjectionScope,
    teamsStore,
    refreshOperationalCollections,
  } from '../../lib/services/DataStore';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../lib/api/BackendApi';
  import { registrationOutreachApi } from '../../lib/api/RegistrationOutreachApi';
  import { tick } from 'svelte';
  import CreateEventForm from './events/CreateEventForm.svelte';
  import EditEventModal from './events/EditEventModal.svelte';
  import DuplicateEventModal from './events/DuplicateEventModal.svelte';
  import EventRegistrantsModal from './events/EventRegistrantsModal.svelte';
  import SavedFormLibrary from './registration/SavedFormLibrary.svelte';
  import EventCsvImport from './events/EventCsvImport.svelte';
  import EventBatchPublishReview from './events/EventBatchPublishReview.svelte';
  import ChangeReceipt from './ui/ChangeReceipt.svelte';
  import SuccessToast from './ui/SuccessToast.svelte';
  import EventFilters from './events/EventFilters.svelte';
  import { buildTeamReferenceIndex, teamNameForReference, teamReferenceMatches } from '../../lib/ui/teamReferences';

  export let activeTeam: string | { id?: unknown } | null = null;
  export let activeResultId: string | null = null;
  export let onTargetConsumed: (id: string) => void = () => {};
  export let onStartRegistrationEmail: (draft: {
    eventId: string;
    eventTitle: string;
  }) => void = () => {};

  let events: any[] = [];
  let isCreateFormOpen = false;
  let showImport = false;
  let showSavedForms = false;
  let isDuplicateModalOpen = false;
  let showRegistrantsForEvent = null;
  let eventToDuplicate: any = null;
  let editingEvent: any = null;
  let expandedEventId: string | null = null;

  let selectedDraftEventIds = new Set<string>();
  let publishingSelectedDrafts = false;
  let showBatchPublishReview = false;
  let batchPublishReceipt: { published: number; failed: number; reference: string } | null = null;
  let eventChangeReceipt: { title: string } | null = null;
  let creatingShareableLinkForEventId = '';
  let shareableRegistrationLinks: Record<string, { url: string; expiresAt: string }> = {};
  let shareableLinkErrors: Record<string, { message: string; requestId: string }> = {};
  let shareableLinkCopyMessage = '';
  let shareableLinkTenantId = '';
  let shareDialogEvent: any = null;
  const shareableLinkOperationKeys = new Map<string, string>();

  let activeTab = 'Upcoming';
  let showEventTools = false;
  let eventSearch = '';
  let eventTeamFilter = '';
  let eventStatusFilter = '';
  let eventSeasonFilter = '';
  let eventFromDate = '';
  let eventToDate = '';
  let previousSelectedTeamId = '';
  let teams: Record<string, string> = {};
  let consumedTargetId = '';
  const eventLifecycleStatuses = new Set(['draft', 'published', 'archived']);

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
            occurrenceCount: data.occurrenceCount || 1,
            seasonCoverage: data.seasonCoverage === true,
            isMultiDateSeries: data.isMultiDateSeries || false,
            type:
              typeof data.type === 'string' && data.type.trim()
                ? data.type.trim()
                : null,
            eventType:
              typeof data.eventType === 'string' && data.eventType.trim()
                ? data.eventType.trim()
                : null,
            priceCents: eventPriceCents(data),
            // Keep both supplied authorities intact so conflicts remain visible.
            currency: data.currency ?? null,
            registrationKind:
              typeof data.registrationKind === 'string' && data.registrationKind.trim()
                ? data.registrationKind.trim()
                : null,
            paymentTerms: data.paymentTerms ?? null,
            paymentPolicies: data.paymentPolicies ?? null,
            notes: data.notes || '',
            seasonId: data.seasonId || null,
            registrationFormId: data.registrationFormId || null,
            registrationMethod: data.registrationMethod === 'easy' ? 'easy' : 'form',
            registrationFormConfig: data.registrationFormConfig || null,
            isRegistrationEnabled: data.isRegistrationEnabled === true,
            isVisible: data.isVisible === true,
          };
  }

  $: teamReferenceIndex = buildTeamReferenceIndex($teamsStore);
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
    .filter((event) => teamReferenceMatches(teamReferenceIndex, event.teamId, selectedTeamId))
    .map(mapEvent)
    .filter((event) => !event.isDeleted);
  $: malformedEventCount = mappedEvents.filter((event) => !event.id).length;
  $: events = mappedEvents.filter((event) => Boolean(event.id));

  $: now = new Date();
  $: if ($tenantIdStore !== shareableLinkTenantId) {
    shareableLinkTenantId = $tenantIdStore || '';
    eventChangeReceipt = null;
    shareableRegistrationLinks = {};
    shareableLinkErrors = {};
    shareableLinkCopyMessage = '';
    shareableLinkOperationKeys.clear();
    creatingShareableLinkForEventId = '';
  }

  // Sort past events descending (newest past event first)
  $: pastEvents = events
    .filter(e => e.lifecycleStatus !== 'draft' && e.lifecycleStatus !== 'archived' && e.dateObj && e.dateObj < now)
    .sort((a, b) => b.dateObj - a.dateObj);

  // Sort upcoming events ascending (soonest event first)
  $: upcomingEvents = events
    .filter(e => e.lifecycleStatus !== 'draft' && e.lifecycleStatus !== 'archived' && (!e.dateObj || e.dateObj >= now))
    .sort((a, b) => {
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj - b.dateObj;
    });

  $: eventSearchQuery = eventSearch.trim().toLocaleLowerCase();
  $: if (selectedTeamId !== previousSelectedTeamId) {
    previousSelectedTeamId = selectedTeamId;
    eventTeamFilter = selectedTeamId;
  }
  $: draftEvents = events.filter(event => event.lifecycleStatus === 'draft');
  $: archivedEvents = events.filter(event => event.lifecycleStatus === 'archived');
  $: presetEvents = activeTab === 'Drafts' ? draftEvents : activeTab === 'Archived' ? archivedEvents : activeTab === 'Upcoming' ? upcomingEvents : pastEvents;
  $: filteredEventOccurrences = presetEvents.filter((event) =>
    (!eventSearchQuery || [event.title, event.location, event.type].some((value) => String(value || '').toLocaleLowerCase().includes(eventSearchQuery)))
    && teamReferenceMatches(teamReferenceIndex, event.teamId, eventTeamFilter)
    && (!eventStatusFilter || event.lifecycleStatus === eventStatusFilter)
    && (!eventSeasonFilter || event.seasonId === eventSeasonFilter)
    && (!eventFromDate || event.dateKey >= eventFromDate)
    && (!eventToDate || event.dateKey <= eventToDate)
  ).sort((a, b) => Number(b.lifecycleStatus === 'published') - Number(a.lifecycleStatus === 'published'));
  $: visibleEvents = groupEventSeries(filteredEventOccurrences, events);
  $: selectedDraftEvents = groupEventSeries(events, events).filter((group) => group.occurrences.some((event) => selectedDraftEventIds.has(event.id) && event.lifecycleStatus === 'draft'));
  function registrationCount(event: any) {
    if (!event.occurrences || event.occurrences.length < 2) return DataStore.getEventRegistrationCount(event, $registrationsStore);
    const ids = new Set(event.occurrences.map((entry: any) => entry.id));
    return new Set($registrationsStore.filter((entry) => ids.has(entry.eventId)).map((entry) => entry.userId || entry.id)).size;
  }
  $: registrationProjectionIsAuthoritative =
    !$registrationsProjectionScope.loading
    && !$registrationsProjectionScope.error
    && !$registrationsProjectionScope.truncated;
  $: if (activeResultId && activeResultId !== consumedTargetId) {
    const targetEvent = events.find((event) => String(event.id) === activeResultId);
    if (targetEvent) {
      const targetId = activeResultId;
      consumedTargetId = targetId;
      activeTab = targetEvent.lifecycleStatus === 'draft' ? 'Drafts' : targetEvent.lifecycleStatus === 'archived' ? 'Archived' : targetEvent.dateObj && targetEvent.dateObj < now ? 'Past' : 'Upcoming';
      void focusEventResult(targetId);
    }
  }
  async function focusEventResult(targetId: string) {
    await tick();
    const group = visibleEvents.find((entry) => entry.occurrences.some((event) => event.id === targetId));
    expandedEventId = group?.id || targetId;
    await tick();
    const button = Array.from(document.querySelectorAll<HTMLElement>('[data-event-record-id]')).find((element) => element.dataset.eventRecordId === (group?.id || targetId));
    button?.scrollIntoView?.({ block: 'center' }); button?.focus(); onTargetConsumed(targetId);
  }
  $: if (!activeResultId) consumedTargetId = '';

  function handleCreateEventSuccess() {
    refreshOperationalCollections('events');
    eventChangeReceipt = {
      title: 'Schedule draft saved',
    };
    isCreateFormOpen = false;
    activeTab = 'Drafts';
  }

  function handleEditEventSuccess() {
    refreshOperationalCollections('events');
    eventChangeReceipt = {
      title: 'Event updated',
    };
    editingEvent = null;
  }

  function openEditor(event: any) {
    editingEvent = { ...event, lifecycleStatus: event.occurrences?.find((entry: any) => entry.id === event.id)?.lifecycleStatus || event.lifecycleStatus };
  }

  function reviewDraftPublication(event: any) {
    selectedDraftEventIds = new Set(event.occurrences.filter((entry: any) => entry.lifecycleStatus === 'draft').map((entry: any) => entry.id));
    showBatchPublishReview = true;
  }

  async function publishSelectedDrafts() {
    const tenantId = $tenantIdStore;
    if (!tenantId || publishingSelectedDrafts || !selectedDraftEvents.length) return;
    publishingSelectedDrafts = true;
    const batchKey = createIdempotencyKey('event-batch-publish');
    let published = 0;
    let failed = 0;
    for (const group of [...selectedDraftEvents]) {
      let groupFailed = false;
      if (group.occurrences.some((event) => event.occurrenceCount > group.occurrences.length) || $eventsProjectionScope.truncated) { failed++; continue; }
      for (const event of group.occurrences.filter((event) => event.lifecycleStatus === 'draft' && selectedDraftEventIds.has(event.id))) {
        try {
          await backendClient.updateEvent(tenantId, event.id, { lifecycleStatus: 'published' }, 'Publish reviewed event schedule from CRM.', `${batchKey}:${event.id}`);
          const next = new Set(selectedDraftEventIds); next.delete(event.id); selectedDraftEventIds = next;
        } catch { groupFailed = true; }
      }
      if (groupFailed) failed++; else published++;
    }
    publishingSelectedDrafts = false;
    refreshOperationalCollections('events');
    showBatchPublishReview = false;
    batchPublishReceipt = { published, failed, reference: batchKey };
  }

  function toggleExpand(evt: any) {
    if (expandedEventId === evt.id) {
      expandedEventId = null;
    } else {
      expandedEventId = evt.id;
    }
  }

  function eventStatusLabel(value: unknown) {
    const status = String(value || '').trim().toLowerCase();
    if (!status || status === 'status_unavailable') return 'Status unavailable';
    return status.charAt(0).toUpperCase() + status.slice(1).replaceAll('_', ' ');
  }

  function eventTypeLabel(event: any) {
    return String(event?.type || event?.eventType || '').trim() || 'Type unavailable';
  }

  function eventTeamLabel(event: any) {
    return teamNameForReference(teamReferenceIndex, event?.teamId);
  }

  function eventRegistrationIsLive(event: any) {
    const eventEndsAt = event.endDateObj
      || (event.dateObj
        ? new Date(event.dateObj.getTime() + 24 * 60 * 60 * 1000)
        : null);
    return (
      event.lifecycleStatus === 'published'
      && event.isVisible === true
      && event.isRegistrationEnabled === true
      && !event.isDeleted
      && Boolean(eventEndsAt && eventEndsAt.getTime() >= Date.now())
    );
  }

  function shareableLinkAvailabilityMessage(event: any) {
    if (event.lifecycleStatus !== 'published') {
      return 'Publish this event before creating a registration link.';
    }
    if (event.isRegistrationEnabled !== true) {
      return 'Attach and publish a registration form before creating a registration link.';
    }
    if (event.isVisible !== true) {
      return 'Make this published event visible before creating a registration link.';
    }
    return 'Registration is no longer live for this event.';
  }

  function shareableLinkExpirationLabel(expiresAt: string) {
    const value = new Date(expiresAt);
    return Number.isNaN(value.getTime())
      ? 'the registration deadline'
      : value.toLocaleString();
  }

  async function createShareableRegistrationLink(event: any) {
    const eventId = String(event.id || '').trim();
    const tenantId = $tenantIdStore;
    if (
      !tenantId
      || !eventId
      || !eventRegistrationIsLive(event)
      || creatingShareableLinkForEventId
    ) return;
    const operationKey = shareableLinkOperationKeys.get(eventId)
      || createIdempotencyKey('event-shareable-registration-link');
    shareableLinkOperationKeys.set(eventId, operationKey);
    creatingShareableLinkForEventId = eventId;
    shareableLinkCopyMessage = '';
    shareableLinkErrors = {
      ...shareableLinkErrors,
      [eventId]: { message: '', requestId: '' },
    };
    try {
      const link = await registrationOutreachApi.createShareableLink({
        tenantId,
        eventId,
        idempotencyKey: operationKey,
      });
      if ($tenantIdStore !== tenantId) return;
      shareableRegistrationLinks = {
        ...shareableRegistrationLinks,
        [eventId]: { url: link.url, expiresAt: link.expiresAt },
      };
      shareDialogEvent = event;
    } catch (error: unknown) {
      if ($tenantIdStore !== tenantId) return;
      shareableLinkErrors = {
        ...shareableLinkErrors,
        [eventId]: {
          message: 'Could not create the registration link.',
          requestId: error instanceof BackendApiError ? error.requestId || '' : '',
        },
      };
    } finally {
      if ($tenantIdStore === tenantId) creatingShareableLinkForEventId = '';
    }
  }

  async function copyShareableRegistrationLink(eventId: string) {
    const link = shareableRegistrationLinks[eventId]?.url;
    if (!link) return;
    shareableLinkCopyMessage = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      shareableLinkCopyMessage = 'Link copied.';
    } catch {
      shareableLinkCopyMessage = 'Copy the link shown above.';
    }
  }

  function openDuplicateModal(event: any) {
    eventToDuplicate = { ...event };
    isDuplicateModalOpen = true;
  }
</script>

{#if shareDialogEvent}
  <div class="crm-ui-modal-root">
    <div class="crm-ui-modal-shell">
      <div class="crm-ui-modal-panel-lg">
        <div class="crm-ui-modal-body">
          <button class="crm-ui-button-secondary" on:click={() => shareDialogEvent = null}>×</button>
          <h3 class="crm-ui-modal-title">Share {shareDialogEvent.title}</h3>
          <p class="crm-ui-field">{shareableRegistrationLinks[shareDialogEvent.id].url}</p>
          <div class="crm-ui-between">
            <button class="crm-ui-button-secondary" on:click={() => navigator.clipboard?.writeText(shareableRegistrationLinks[shareDialogEvent.id].url)}>Copy link</button>
            <button
              class="crm-ui-button-primary"
              on:click={() => {
                onStartRegistrationEmail({ eventId: shareDialogEvent.id, eventTitle: shareDialogEvent.title });
                shareDialogEvent = null;
              }}
            >Send link</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if isCreateFormOpen}
  <CreateEventForm
    teamId={selectedTeamId || null}
    on:cancel={() => isCreateFormOpen = false}
    on:success={handleCreateEventSuccess}
  />
{/if}

{#if editingEvent}
  <EditEventModal
    bind:event={editingEvent}
    {teams}
    teamReferences={teamReferenceIndex}
    seriesSize={editingEvent.eventSeriesId
      ? events.filter((event) => event.eventSeriesId === editingEvent.eventSeriesId).length
      : 1}
    projectionComplete={!$eventsProjectionScope.truncated}
    defaultApplyToSeries={Boolean(editingEvent.occurrences?.length > 1)}
    on:cancel={() => editingEvent = null}
    on:success={handleEditEventSuccess}
  />
{/if}

{#if showBatchPublishReview}
  <EventBatchPublishReview
    events={selectedDraftEvents}
    teamNames={teams}
    busy={publishingSelectedDrafts}
    onCancel={() => { if (!publishingSelectedDrafts) { showBatchPublishReview = false; selectedDraftEventIds = new Set(); } }}
    onConfirm={publishSelectedDrafts}
  />
{/if}

<DuplicateEventModal
  bind:event={eventToDuplicate}
  bind:isOpen={isDuplicateModalOpen}
  on:close={() => { isDuplicateModalOpen = false; eventToDuplicate = null; }}
/>

<div class="p-4 sm:p-6 md:p-8 space-y-5">
  <header class="events-header">
    <h2 class="crm-ui-page-title">{$programTermsStore.title}</h2>
    <div class="events-heading-actions">
      <button type="button" class="crm-ui-event-top-primary" on:click={() => isCreateFormOpen = true}>{$programTermsStore.add}</button>
      <div class="events-tools">
        <button type="button" class="events-tools-trigger" aria-label="Schedule tools" aria-expanded={showEventTools} on:click={() => showEventTools = !showEventTools} on:keydown={(event) => { if (event.key === 'Escape') showEventTools = false; }}>•••</button>
        {#if showEventTools}
          <div class="events-tools-menu">
            <button type="button" on:click={() => { showEventTools = false; showSavedForms = true; }}>Saved forms</button>
            <button type="button" on:click={() => { showEventTools = false; showImport = true; }}>Import CSV</button>
          </div>
        {/if}
      </div>
    </div>
  </header>



  {#if batchPublishReceipt}
    <ChangeReceipt
      status={batchPublishReceipt.failed ? 'partial' : 'success'}
      title={batchPublishReceipt.failed ? 'Publication partially completed' : 'Events published'}
      message={`${batchPublishReceipt.published} event${batchPublishReceipt.published === 1 ? '' : 's'} published${batchPublishReceipt.failed ? `; ${batchPublishReceipt.failed} remained selected for retry.` : '.'}`}
      reference={batchPublishReceipt.reference}
      onDismiss={() => batchPublishReceipt = null}
    />
  {/if}
  {#if eventChangeReceipt}
    {#key eventChangeReceipt}
      <SuccessToast title={eventChangeReceipt.title} onDismiss={() => eventChangeReceipt = null} />
    {/key}
  {/if}

  {#if $eventsProjectionScope.truncated || $teamsProjectionScope.truncated}
    <p class="crm-ui-notice-card" role="status">
      This view is limited to {$eventsProjectionScope.limit} events and {$teamsProjectionScope.limit} teams. Search, series validation, and counts may be incomplete.
    </p>
  {/if}
  {#if malformedEventCount > 0}
    <p class="crm-ui-notice-card" role="status">
      {malformedEventCount} malformed event {malformedEventCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.
    </p>
  {/if}

  {#if events.length > 0}
  <EventFilters
    itemPlural={$programTermsStore.plural}
    group={$programTermsStore.group}
    groups={$programTermsStore.groups}
    bind:search={eventSearch}
    bind:teamId={eventTeamFilter}
    bind:status={eventStatusFilter}
    bind:seasonId={eventSeasonFilter}
    bind:fromDate={eventFromDate}
    bind:toDate={eventToDate}
    teamLocked={Boolean(selectedTeamId)}
    teams={$teamsStore.map((team) => ({ id: String(team.id || ''), name: String(team.name || 'Team name unavailable') }))}
    seasons={$seasonsStore.map((season) => ({ id: String(season.id || ''), name: String(season.name || season.title || 'Season name unavailable') }))}
  >
    <nav slot="view" class="event-view-tabs" aria-label="Schedule views">
      {#each ['Upcoming', 'Drafts', 'Past', ...(archivedEvents.length ? ['Archived'] : [])] as view}
        <button type="button" aria-current={activeTab === view ? 'page' : undefined} on:click={() => { activeTab = view; eventStatusFilter = ''; expandedEventId = null; }}>{view}{#if view === 'Drafts' && draftEvents.length}<span class="draft-count">{draftEvents.length}</span>{/if}</button>
      {/each}
    </nav>
  </EventFilters>

  {/if}

  {#if $eventsProjectionScope.loading || $teamsProjectionScope.loading}
    <div class="crm-ui-empty" role="status">Loading schedule…</div>
  {:else if $eventsProjectionScope.error || $teamsProjectionScope.error}
    <div class="crm-ui-danger" role="alert">
      {$eventsProjectionScope.error || $teamsProjectionScope.error}
    </div>
  {:else}
  <div class="event-list">
    {#each visibleEvents as event (event.id)}
      <article class="crm-ui-event-card {activeResultId === String(event.id) ? 'ring-2 focus:ring-[var(--crm-brand-focus)]' : ''}">
        <!-- Collapsed Summary Card -->
        <div class="crm-ui-event-card-summary">
          <div class="min-w-0 flex-1">
            <div class="event-card-heading">
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
                <span class="crm-ui-event-badge crm-ui-event-badge-unavailable">{event.lifecycleStatus === 'mixed' ? 'Mixed status' : 'Status unavailable'}</span>
              {/if}
            </div>
          </div>
          <div class="event-facts">
            <div class="event-fact">
              <strong>{event.dateObj ? event.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date unavailable'}</strong>
              <span>{event.dateObj ? event.dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Time unavailable'}{event.endDateObj ? ` – ${event.endDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}</span>
              {#if event.occurrences.length > 1}<span>{event.occurrences.length} sessions</span>{/if}
            </div>
            <div class="event-fact">
              <strong>{eventTeamLabel(event)}</strong>
              <span>{event.location || 'Location unavailable'}</span>
            </div>
            <button
              type="button"
              class="event-fact event-registrants"
              aria-label={$registrationsProjectionScope.truncated
                ? `View loaded registrants for ${event.title}; participant list is limited`
                : `View ${registrationCount(event)} registrants for ${event.title}`}
              disabled={$registrationsProjectionScope.loading || Boolean($registrationsProjectionScope.error)}
              on:click={() => showRegistrantsForEvent = event}
            >
              <strong>{$registrationsProjectionScope.truncated ? '—' : registrationCount(event)}</strong>
              <span>Registered</span>
            </button>
          </div>
          <div class="event-summary-actions">
            <button type="button" data-event-record-id={event.id} class="event-details-button"
              aria-label={`${expandedEventId === event.id ? 'Collapse' : 'Expand'} ${event.title}`}
              aria-expanded={expandedEventId === event.id} on:click={() => toggleExpand(event)}>
              {expandedEventId === event.id ? 'Hide details' : 'View details'}
            </button>
            <button
              type="button"
              class="event-edit-button"
              on:click={() => openEditor(event)}
            >
              Edit
            </button>
            {#if event.hasDrafts}
              <button type="button" class="crm-ui-event-top-primary event-publish-button" disabled={publishingSelectedDrafts} on:click={() => reviewDraftPublication(event)}>Review & publish</button>
            {/if}


          </div>
        </div>

        <!-- Expanded read-only event inspection -->
        {#if expandedEventId === event.id}
          <div class="border-t border-gray-200 bg-slate-50 p-6 space-y-4">
            <div class="crm-ui-between">
              <div>
                <h4 class="text-sm font-bold text-gray-900 uppercase tracking-wider">{$programTermsStore.singular} details</h4>
                <p class="mt-1 text-sm text-gray-600">Review this event without changing it. Use Edit to make updates.</p>
              </div>
              <button
                type="button"
                class="crm-ui-button-secondary"
                on:click={() => openEditor(event)}
              >Edit event</button>
            </div>

            <dl class="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt class="crm-ui-label-caps-sm">Date and time</dt>
                <dd class="mt-1 text-sm text-gray-900">
                  {event.date}{event.endDateObj ? ` – ${event.endDateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
                </dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Status</dt>
                <dd class="mt-1 text-sm text-gray-900">{eventStatusLabel(event.lifecycleStatus)}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Team</dt>
                <dd class="mt-1 text-sm text-gray-900">{eventTeamLabel(event)}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Location</dt>
                <dd class="mt-1 text-sm text-gray-900">{event.location || 'Location unavailable'}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">{$programTermsStore.singular} type</dt>
                <dd class="mt-1 text-sm text-gray-900">{eventTypeLabel(event)}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Price</dt>
                <dd class="mt-1 text-sm text-gray-900">{eventPriceLabel(event)}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Registration form</dt>
                <dd class="mt-1 text-sm text-gray-900">{event.registrationMethod === 'easy' ? 'Easy registration' : event.registrationFormId ? 'Attached' : 'Not attached'}</dd>
              </div>
              <div>
                <dt class="crm-ui-label-caps-sm">Registered</dt>
                <dd class="mt-1 text-sm text-gray-900">
                  {$registrationsProjectionScope.truncated
                    ? 'Count unavailable'
                    : registrationCount(event)}
                </dd>
              </div>
            </dl>

            {#if event.occurrences.length > 1}
              <details class="rounded-lg border border-gray-200 bg-white p-4"><summary class="cursor-pointer text-sm font-medium text-[var(--crm-brand-link)]">View scheduled dates</summary><ul class="mt-3 divide-y divide-gray-100">{#each event.occurrences as occurrence (occurrence.id)}<li class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{occurrence.date}</span><span class="text-gray-500">{eventStatusLabel(occurrence.lifecycleStatus)}</span><button type="button" class="crm-ui-button-secondary text-xs" on:click={() => editingEvent = { ...occurrence }}>Edit session</button></li>{/each}</ul></details>
            {/if}
            {#if event.notes}
              <section class="rounded-lg border border-gray-200 bg-white p-4">
                <h5 class="crm-ui-label-caps-sm">Notes</h5>
                <p class="mt-1 whitespace-pre-wrap text-sm text-gray-700">{event.notes}</p>
              </section>
            {/if}

            <section class="rounded-lg border border-sky-200 bg-white p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 class="text-sm font-semibold text-gray-900">Share registration</h5>
                  {#if !eventRegistrationIsLive(event)}
                    <p class="mt-1 text-sm text-gray-600">{shareableLinkAvailabilityMessage(event)}</p>
                  {/if}
                </div>
                {#if eventRegistrationIsLive(event)}
                  <button
                    type="button"
                    class="crm-ui-button-secondary"
                    disabled={creatingShareableLinkForEventId === event.id}
                    on:click={() => shareableRegistrationLinks[event.id]
                      ? (shareDialogEvent = event)
                      : createShareableRegistrationLink(event)}
                  >
                    {creatingShareableLinkForEventId === event.id
                      ? 'Creating link…'
                      : 'Share Link'}
                  </button>
                {/if}
              </div>
              {#if shareableRegistrationLinks[event.id]}
                <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    id={`shareable-registration-link-${event.id}`}
                    aria-label={`Shareable registration link for ${event.title}`}
                    type="text"
                    readonly
                    value={shareableRegistrationLinks[event.id].url}
                    class="crm-ui-field flex-1"
                  />
                  <button
                    type="button"
                    class="crm-ui-button-secondary"
                    on:click={() => copyShareableRegistrationLink(event.id)}
                  >Copy link</button>
                </div>
                <p class="mt-2 text-xs text-gray-500">Available until {shareableLinkExpirationLabel(shareableRegistrationLinks[event.id].expiresAt)}.</p>
              {/if}
              {#if shareableLinkErrors[event.id]?.message}
                <div class="mt-3 crm-ui-danger" role="alert">
                  <p>{shareableLinkErrors[event.id].message}</p>
                </div>
              {/if}
              {#if shareableLinkCopyMessage && shareableRegistrationLinks[event.id]}
                <p use:toast={{dismiss: () => shareableLinkCopyMessage = ''}} class="mt-2 text-sm text-green-700" role="status">{shareableLinkCopyMessage}</p>
              {/if}
            </section>

            <div class="flex justify-end space-x-3 pt-3 border-t border-gray-200">
              <button
                type="button"
                on:click={() => openDuplicateModal(event)}
                class="crm-ui-event-action-secondary"
              >
                Add dates
              </button>
              <button
                type="button"
                on:click={() => { expandedEventId = null; }}
                class="crm-ui-event-action-secondary"
              >
                Close details
              </button>
            </div>
          </div>
        {/if}
      </article>
    {:else}
      <div class="crm-ui-empty">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">{activeTab === 'Drafts' ? 'No drafts' : activeTab === 'Upcoming' ? 'Nothing scheduled yet' : `No ${activeTab.toLowerCase()} activities`}</h3>
        {#if events.length === 0}<p class="mt-3 text-xs text-gray-500">Once · Repeating · Your dates</p>{/if}
      </div>
    {/each}
  </div>
  {/if}
</div>

  {#if showImport}
    <EventCsvImport onClose={() => showImport = false} on:success={event => { activeTab = 'Drafts'; showImport = false; refreshOperationalCollections('events'); eventChangeReceipt = { title: `${event.detail.created} event draft${event.detail.created === 1 ? '' : 's'} imported` }; }}
      teams={$teamsStore.map((team) => ({ id: String(team.id || ''), name: String(team.name || '') }))}
      existingEvents={events.map((event) => ({
        id: event.id,
        title: event.title,
        teamId: event.teamId,
        dateKey: event.dateKey,
        startTime: event.dateObj ? `${String(event.dateObj.getHours()).padStart(2, '0')}:${String(event.dateObj.getMinutes()).padStart(2, '0')}` : '',
      }))}
    />
  {/if}
  {#if showSavedForms}<SavedFormLibrary onClose={() => showSavedForms = false} />{/if}

{#if showRegistrantsForEvent}
  <EventRegistrantsModal
    teamReferences={teamReferenceIndex}
    event={showRegistrantsForEvent}
    registrations={$registrationsStore}
    incomplete={$registrationsProjectionScope.truncated}
    exactCount={registrationProjectionIsAuthoritative
      ? registrationCount(showRegistrantsForEvent)
      : null}
    onClose={() => showRegistrantsForEvent = null}
  />
{/if}

<style>
  .events-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .events-heading-actions { display:flex; align-items:center; gap:8px; }
  .events-tools { position:relative; }
  .events-tools-trigger { min-width:40px; min-height:40px; color:var(--crm-brand-link); border:1px solid #dce3ed; border-radius:8px; }
  .events-tools-menu { position:absolute; top:calc(100% + 6px); right:0; min-width:160px; padding:6px; background:var(--crm-surface,#fff); border:1px solid #dce3ed; border-radius:10px; box-shadow:0 6px 18px #0002; z-index:20; }
  .events-tools-menu button { display:block; width:100%; min-height:44px; padding:10px 12px; text-align:left; font-size:14px; color:var(--crm-brand-link); }
  .event-view-tabs { display:flex; gap:16px; flex-wrap:wrap; }
  .event-view-tabs button { display:flex; align-items:center; gap:5px; min-height:44px; font-size:14px; color:var(--crm-muted,#64748b); border-bottom:2px solid transparent; }
  .event-view-tabs button[aria-current] { color:var(--crm-brand-link); border-bottom-color:var(--crm-brand-link); font-weight:600; }
  .draft-count { font-size:12px; border-radius:10px; background:var(--crm-brand-surface,#e9f2fc); padding:0 6px; }
  .crm-ui-event-card { box-shadow:none; }
  .crm-ui-event-card-summary { padding:16px; gap:12px; flex-direction:column; align-items:stretch; }
  .crm-ui-event-card-summary .crm-ui-title { font-size:16px; line-height:24px; font-weight:600; }
  .crm-ui-event-badge { font-size:12px; font-weight:500; }
  .event-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr)); gap:16px; }
  .event-card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin:-16px -16px 0; padding:14px 16px; background:color-mix(in srgb,var(--crm-brand-link,#0b2d50) 5%,var(--crm-surface,#fff)); border-bottom:1px solid #e2e8f0; }
  .event-card-heading .crm-ui-title { min-width:0; overflow-wrap:anywhere; }
  .crm-ui-event-badge { flex-shrink:0; }
  .event-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); padding:10px 0; }
  .event-fact { display:flex; flex-direction:column; align-items:center; text-align:center; gap:5px; padding:0 8px; min-width:0; font-size:14px; line-height:21px; overflow-wrap:anywhere; }
  .event-fact + .event-fact { border-left:1px solid #e2e8f0; }
  .event-fact strong { font-weight:600; color:var(--crm-text,inherit); }
  .event-fact span { color:var(--crm-muted,#64748b); }
  .event-registrants { justify-content:flex-start; background:transparent; cursor:pointer; }
  .event-summary-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; border-top:1px solid #e2e8f0; padding-top:10px; font-size:14px; }

  .event-details-button { min-height:40px; color:var(--crm-brand-link); }
  .event-edit-button { margin-left:auto; min-height:40px; padding:0 8px; font-size:14px; color:var(--crm-brand-link); }
  .event-publish-button { font-size:14px; }
</style>
