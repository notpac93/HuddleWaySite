<script lang="ts">
  import { onMount } from 'svelte';
  import {
    collection,
    getDocs,
    orderBy,
    query,
    where,
  } from 'firebase/firestore';
  import { db } from '../../lib/firebase';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import { eventsStore, seasonsStore } from '../../lib/services/DataStore';
  import {
    BackendApiError,
    createIdempotencyKey,
  } from '../../lib/api/BackendApi';
  import StatusButton from './ui/StatusButton.svelte';
  import { modalFocus } from '../../lib/ui/modalFocus';

  type WallMessage = {
    id: string;
    authorName: string | null;
    subject: string | null;
    body: string;
    teamId: string | null;
    attachmentScope: 'all' | 'event' | 'season';
    eventId: string | null;
    eventTitle: string | null;
    seasonId: string | null;
    seasonName: string | null;
    createdAt: Date | null;
  };

  type AttachmentScope = 'all' | 'event' | 'season';

  const SUBJECT_MAX_LENGTH = 200;
  const BODY_MAX_LENGTH = 4_000;

  let messages: WallMessage[] = [];
  let isAdding = false;
  let isLoading = true;
  let loadError = '';
  let loadRequestId = '';
  let activeTenantId = '';
  let searchQuery = '';
  let expandedMessageIds = new Set<string>();

  let subject = '';
  let body = '';
  let teamId = 'program';
  let attachmentScope: AttachmentScope = 'all';
  let selectedEventId = '';
  let selectedSeasonId = '';
  let submitState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let operationMessage = '';
  let operationRequestId = '';
  let recallingMessageId = '';
  let postIdempotencyKey = createIdempotencyKey('message-batch');
  let postMessageId = `message_${globalThis.crypto.randomUUID()}`;
  let postPayloadSignature = '';
  const recallIdempotencyKeys = new Map<string, string>();
  let tenantGeneration = 0;
  let recallTarget: WallMessage | null = null;

  $: normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  $: eventOptions = $eventsStore
    .map((event) => ({
      id: String(event.id || '').trim(),
      title: String(event.title || event.name || event.id || 'Untitled event').trim(),
    }))
    .filter((event) => event.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: seasonOptions = $seasonsStore
    .map((season) => ({
      id: String(season.id || '').trim(),
      title: String(season.name || season.title || season.id || 'Untitled season').trim(),
    }))
    .filter((season) => season.id)
    .sort((a, b) => a.title.localeCompare(b.title));
  $: visibleMessages = normalizedSearch
    ? messages.filter((message) =>
        [
          message.authorName,
          message.subject,
          message.body,
          audienceLabel(message.teamId),
          attachmentLabel(message),
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch)))
    : messages;
  $: postIsValid =
    teamId === 'program'
    && body.trim().length > 0
    && body.trim().length <= BODY_MAX_LENGTH
    && subject.trim().length <= SUBJECT_MAX_LENGTH
    && (attachmentScope === 'all'
      || (attachmentScope === 'event' && Boolean(selectedEventId))
      || (attachmentScope === 'season' && Boolean(selectedSeasonId)));
  $: canPublish = postIsValid;
  $: {
    const signature = JSON.stringify({
      subject: subject.trim(),
      body: body.trim(),
      teamId,
      attachmentScope,
      selectedEventId,
      selectedSeasonId,
    });
    if (signature !== postPayloadSignature && submitState !== 'loading') {
      postPayloadSignature = signature;
      postIdempotencyKey = createIdempotencyKey('message-batch');
      postMessageId = `message_${globalThis.crypto.randomUUID()}`;
      if (submitState === 'error') submitState = 'idle';
    }
  }

  onMount(() => {
    const unsubscribe = tenantIdStore.subscribe((tenantId) => {
      tenantGeneration += 1;
      activeTenantId = tenantId || '';
      isAdding = false;
      searchQuery = '';
      messages = [];
      expandedMessageIds = new Set();
      resetComposer();
      operationMessage = '';
      operationRequestId = '';
      recallTarget = null;
      if (tenantId) {
        void fetchMessages(tenantId);
      } else {
        isLoading = false;
        loadError = '';
        loadRequestId = '';
      }
    });
    return unsubscribe;
  });

  function requestIdFrom(error: unknown) {
    return error instanceof BackendApiError ? error.requestId || '' : '';
  }

  function resetComposer() {
    subject = '';
    body = '';
    teamId = 'program';
    attachmentScope = 'all';
    selectedEventId = '';
    selectedSeasonId = '';
    submitState = 'idle';
  }

  function handleAttachmentScopeChange() {
    if (attachmentScope === 'all') {
      selectedEventId = '';
      selectedSeasonId = '';
    } else if (attachmentScope === 'event') {
      selectedSeasonId = '';
    } else {
      selectedEventId = '';
    }
  }

  function audienceLabel(messageTeamId: string | null) {
    return messageTeamId && messageTeamId !== 'program'
      ? 'Public organization post · legacy team restriction not enforced'
      : 'Public organization post';
  }

  function attachmentLabel(message: WallMessage) {
    if (message.attachmentScope === 'event' || message.eventId || message.eventTitle) {
      return `Event · ${message.eventTitle || message.eventId || 'Attached event'}`;
    }
    if (message.attachmentScope === 'season' || message.seasonId || message.seasonName) {
      return `Season · ${message.seasonName || message.seasonId || 'Attached season'}`;
    }
    return 'All organization';
  }

  function toggleMessageDetails(messageId: string) {
    const nextExpandedIds = new Set(expandedMessageIds);
    if (nextExpandedIds.has(messageId)) {
      nextExpandedIds.delete(messageId);
    } else {
      nextExpandedIds.add(messageId);
    }
    expandedMessageIds = nextExpandedIds;
  }

  function messagePreview(messageBody: string) {
    const normalizedBody = messageBody.trim();
    if (!normalizedBody) return 'Message unavailable';
    return normalizedBody.length > 140
      ? `${normalizedBody.slice(0, 137).trimEnd()}…`
      : normalizedBody;
  }

  async function fetchMessages(tenantId: string) {
    isLoading = true;
    loadError = '';
    loadRequestId = '';
    try {
      const snapshot = await getDocs(query(
        collection(db, 'board_messages'),
        where('tenantId', '==', tenantId),
        where('isDeleted', '==', false),
        where('isSecret', '==', false),
        orderBy('createdAt', 'desc'),
      ));
      if (tenantId !== activeTenantId) return;

      messages = snapshot.docs
        .map((messageDoc) => {
          const data = messageDoc.data();
          return {
            id: messageDoc.id,
            authorName:
              typeof data.authorName === 'string' && data.authorName.trim()
                ? data.authorName.trim()
                : null,
            subject:
              typeof data.subject === 'string' && data.subject.trim()
                ? data.subject.trim()
                : null,
            body: typeof data.body === 'string' ? data.body : '',
            teamId:
              typeof data.teamId === 'string' && data.teamId
                ? data.teamId
                : null,
            attachmentScope:
              data.attachmentScope === 'event' || data.eventId
                ? 'event'
                : data.attachmentScope === 'season' || data.seasonId
                  ? 'season'
                  : 'all',
            eventId: typeof data.eventId === 'string' && data.eventId.trim()
              ? data.eventId.trim()
              : null,
            eventTitle: typeof data.eventTitle === 'string' && data.eventTitle.trim()
              ? data.eventTitle.trim()
              : null,
            seasonId: typeof data.seasonId === 'string' && data.seasonId.trim()
              ? data.seasonId.trim()
              : null,
            seasonName: typeof data.seasonName === 'string' && data.seasonName.trim()
              ? data.seasonName.trim()
              : null,
            createdAt: data.createdAt?.toDate?.() || null,
          };
        })
        .sort((a, b) => {
          const dateOrder =
            (b.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY)
            - (a.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY);
          return dateOrder || a.id.localeCompare(b.id);
        });
    } catch (error) {
      console.error('Wall announcements could not be loaded.');
      if (tenantId !== activeTenantId) return;
      loadError = error instanceof BackendApiError && error.status === 403
        ? 'You do not have permission to view Wall announcements.'
        : 'Wall announcements could not be loaded. Check your connection and try again.';
      loadRequestId = requestIdFrom(error);
    } finally {
      if (tenantId === activeTenantId) isLoading = false;
    }
  }

  async function handleAddMessage() {
    if (submitState === 'loading' || !canPublish) return;
    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      submitState = 'error';
      operationMessage = 'Select an organization before posting.';
      return;
    }

    submitState = 'loading';
    operationMessage = '';
    operationRequestId = '';
    try {
      const result = await backendClient.sendMessageBatch(
        tenantId,
        [{
          id: postMessageId,
          tenantId,
          teamId,
          // The backend derives the authoritative actor from the verified token.
          authorName: '',
          subject: subject.trim(),
          body: body.trim(),
          isSecret: false,
          attachmentScope,
          eventId: attachmentScope === 'event' ? selectedEventId : null,
          seasonId: attachmentScope === 'season' ? selectedSeasonId : null,
        }],
        postIdempotencyKey,
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'success';
      operationMessage = result.publicCount === 1
        ? 'Announcement published.'
        : 'Announcement accepted by the delivery service.';
      isAdding = false;
      subject = '';
      body = '';
      teamId = 'program';
      attachmentScope = 'all';
      selectedEventId = '';
      selectedSeasonId = '';
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      submitState = 'error';
      operationMessage = error instanceof BackendApiError
        ? 'The announcement could not be published.'
        : 'The announcement could not be published. Check your connection and try again.';
      operationRequestId = requestIdFrom(error);
    }
  }

  function requestRecall(message: WallMessage) {
    if (recallingMessageId) return;
    recallTarget = message;
  }

  function closeRecallDialog() {
    if (recallingMessageId) return;
    recallTarget = null;
  }

  async function handleRecallMessage() {
    if (recallingMessageId) return;
    const id = recallTarget?.id;
    if (!id) return;

    const tenantId = $tenantIdStore;
    const generation = tenantGeneration;
    if (!tenantId) {
      operationMessage = 'Select an organization before deleting a post.';
      return;
    }
    recallingMessageId = id;
    operationMessage = '';
    operationRequestId = '';
    const idempotencyKey = recallIdempotencyKeys.get(id)
      || createIdempotencyKey(`message-recall-${id}`);
    recallIdempotencyKeys.set(id, idempotencyKey);
    try {
      await backendClient.recallMessage(
        tenantId,
        id,
        idempotencyKey,
      );
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      await fetchMessages(tenantId);
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      recallIdempotencyKeys.delete(id);
      operationMessage = 'Announcement deleted.';
      recallTarget = null;
    } catch (error) {
      if (generation !== tenantGeneration || tenantId !== $tenantIdStore) return;
      operationMessage = 'The announcement could not be deleted.';
      operationRequestId = requestIdFrom(error);
    } finally {
      if (generation === tenantGeneration && tenantId === $tenantIdStore) {
        recallingMessageId = '';
      }
    }
  }
</script>

{#if recallTarget}
  <div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="recall-announcement-title">
    <div class="flex min-h-full items-center justify-center p-4">
      <button
        type="button"
        class="fixed inset-0 z-0 h-full w-full bg-slate-950/70"
        aria-label="Close delete confirmation"
        tabindex="-1"
        disabled={Boolean(recallingMessageId)}
        on:click={closeRecallDialog}
      ></button>
      <div
        class="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        tabindex="-1"
        use:modalFocus={{ onEscape: closeRecallDialog, initialFocusSelector: '[data-recall-cancel]' }}
      >
        <h3 id="recall-announcement-title" class="text-lg font-semibold text-gray-900">Delete announcement?</h3>
        <p class="mt-2 text-sm text-gray-600">
          Delete “{recallTarget.subject || 'Untitled announcement'}” from {audienceLabel(recallTarget.teamId)}. The Wall post will no longer be available to that audience.
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            data-recall-cancel
            disabled={Boolean(recallingMessageId)}
            class="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            on:click={closeRecallDialog}
          >Cancel</button>
          <button
            type="button"
            disabled={Boolean(recallingMessageId)}
            class="crm-ui-danger-button"
            on:click={handleRecallMessage}
          >{recallingMessageId ? 'Deleting…' : 'Delete announcement'}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="flex h-full flex-col space-y-6 overflow-y-auto p-4 sm:p-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">Wall announcements</h2>
      <p class="text-sm text-gray-500">Review public organization announcements on the app Wall.</p>
    </div>
    <button
      type="button"
      class="rounded-md bg-[#00a4bd] px-4 py-2 text-sm font-medium text-white hover:bg-[#008194]"
      on:click={() => { resetComposer(); isAdding = true; }}
    >
      New announcement
    </button>
  </div>

  {#if operationMessage}
    <div
      class="rounded-md border px-4 py-3 text-sm {submitState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-gray-50 text-gray-700'}"
      role={submitState === 'error' ? 'alert' : 'status'}
    >
      <p>{operationMessage}</p>
      {#if operationRequestId}<p class="mt-1 text-xs">Support request: {operationRequestId}</p>{/if}
    </div>
  {/if}

  {#if isAdding}
    <section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="new-announcement-heading">
      <h3 id="new-announcement-heading" class="mb-4 text-lg font-bold">Create announcement</h3>
      <div class="space-y-4">
        <div>
          <p class="crm-ui-label">Audience</p>
          <p class="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            Public to the entire organization. No notification alert is sent.
          </p>
        </div>
        <div>
          <label for="announcement-attachment" class="crm-ui-label">Attach announcement to</label>
          <select
            id="announcement-attachment"
            bind:value={attachmentScope}
            on:change={handleAttachmentScopeChange}
            class="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 shadow-sm focus:border-[#00a4bd] focus:ring-[#00a4bd] sm:text-sm"
          >
            <option value="all">All organization (no attachment)</option>
            <option value="event">An event</option>
            <option value="season">A season</option>
          </select>
          <p class="crm-ui-hint">Choose one event, one season, or leave it for everyone.</p>
        </div>
        {#if attachmentScope === 'event'}
          <div>
            <label for="announcement-event" class="crm-ui-label">Event</label>
            <select
              id="announcement-event"
              bind:value={selectedEventId}
              disabled={eventOptions.length === 0}
              class="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 shadow-sm focus:border-[#00a4bd] focus:ring-[#00a4bd] disabled:bg-gray-100 sm:text-sm"
            >
              <option value="">Select an event</option>
              {#each eventOptions as event}
                <option value={event.id}>{event.title}</option>
              {/each}
            </select>
            {#if eventOptions.length === 0}<p class="crm-ui-hint">No events are available for this organization.</p>{/if}
          </div>
        {:else if attachmentScope === 'season'}
          <div>
            <label for="announcement-season" class="crm-ui-label">Season</label>
            <select
              id="announcement-season"
              bind:value={selectedSeasonId}
              disabled={seasonOptions.length === 0}
              class="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 shadow-sm focus:border-[#00a4bd] focus:ring-[#00a4bd] disabled:bg-gray-100 sm:text-sm"
            >
              <option value="">Select a season</option>
              {#each seasonOptions as season}
                <option value={season.id}>{season.title}</option>
              {/each}
            </select>
            {#if seasonOptions.length === 0}<p class="crm-ui-hint">No seasons are available for this organization.</p>{/if}
          </div>
        {/if}
        <div>
          <label for="announcement-subject" class="crm-ui-label">Subject (optional)</label>
          <input
            id="announcement-subject"
            type="text"
            bind:value={subject}
            maxlength={SUBJECT_MAX_LENGTH}
            class="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-[#00a4bd] focus:ring-[#00a4bd] sm:text-sm"
            aria-describedby="announcement-subject-help"
          />
          <p id="announcement-subject-help" class="crm-ui-hint">{subject.length}/{SUBJECT_MAX_LENGTH} characters</p>
        </div>
        <div>
          <label for="announcement-body" class="crm-ui-label">Message</label>
          <textarea
            id="announcement-body"
            bind:value={body}
            rows="5"
            maxlength={BODY_MAX_LENGTH}
            class="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-[#00a4bd] focus:ring-[#00a4bd] sm:text-sm"
            aria-describedby="announcement-body-help"
          ></textarea>
          <p id="announcement-body-help" class="crm-ui-hint">{body.length}/{BODY_MAX_LENGTH} characters</p>
        </div>
        <div class="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            disabled={submitState === 'loading'}
            on:click={() => { isAdding = false; resetComposer(); }}
          >
            Cancel
          </button>
          <StatusButton
            type="button"
            state={submitState}
            on:click={handleAddMessage}
            disabled={!canPublish || submitState === 'loading'}
            idleText="Publish announcement"
            loadingText="Publishing…"
            successText="Published"
            class="rounded-md bg-[#00a4bd] px-4 py-2 text-sm font-medium text-white hover:bg-[#008194] disabled:opacity-50"
          />
        </div>
      </div>
    </section>
  {/if}

  <section class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="wall-announcements-heading">
    <div class="border-b border-gray-200 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="wall-announcements-heading" class="font-semibold text-gray-900">Published announcements</h3>
          <p class="crm-ui-hint">
            {messages.length} published
          </p>
        </div>
        <div>
          <label for="announcement-search" class="block text-xs font-medium text-gray-600">Search loaded announcements</label>
          <input
            id="announcement-search"
            type="search"
            bind:value={searchQuery}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-72"
          />
        </div>
      </div>
    </div>

    {#if isLoading}
      <div class="p-8 text-center text-gray-500" role="status">Loading announcements…</div>
    {:else if loadError}
      <div class="p-8 text-center" role="alert">
        <p class="text-sm text-red-700">{loadError}</p>
        {#if loadRequestId}<p class="mt-1 text-xs text-red-700">Support request: {loadRequestId}</p>{/if}
        <button type="button" class="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm" on:click={() => activeTenantId && fetchMessages(activeTenantId)}>Try again</button>
      </div>
    {:else if messages.length === 0}
      <div class="p-8 text-center text-gray-500">No Wall announcements have been published.</div>
    {:else if visibleMessages.length === 0}
      <div class="p-8 text-center text-gray-500">No loaded announcements match “{searchQuery}”.</div>
    {:else}
      <ul class="divide-y divide-gray-200">
        {#each visibleMessages as message (message.id)}
          <li class="hover:bg-gray-50">
            <div class="flex items-start gap-4 p-4">
              <button
                type="button"
                class="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1855c5] focus-visible:ring-offset-2"
                aria-expanded={expandedMessageIds.has(message.id)}
                aria-controls={`announcement-details-${message.id}`}
                on:click={() => toggleMessageDetails(message.id)}
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-bold text-gray-900">{message.authorName || 'Actor unavailable'}</span>
                      <span class="crm-ui-hint-xs">• {message.createdAt ? message.createdAt.toLocaleString() : 'Timestamp unavailable'}</span>
                    </div>
                    <p class="mt-1 text-sm font-medium text-gray-900">{message.subject || 'Announcement'}</p>
                    {#if !expandedMessageIds.has(message.id)}
                      <p class="mt-1 break-words text-sm text-gray-600">{messagePreview(message.body)}</p>
                    {/if}
                  </div>
                  <svg class="mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform {expandedMessageIds.has(message.id) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </button>
              <button
                type="button"
                class="shrink-0 text-left text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                on:click={() => requestRecall(message)}
                disabled={Boolean(recallingMessageId)}
              >
                {recallingMessageId === message.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            {#if expandedMessageIds.has(message.id)}
              <div id={`announcement-details-${message.id}`} class="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h4>
                <p class="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{message.body || 'Message unavailable'}</p>
                <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Audience</dt>
                    <dd class="mt-1 text-gray-900">{audienceLabel(message.teamId)}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Attachment</dt>
                    <dd class="mt-1 text-gray-900">{attachmentLabel(message)}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Published by</dt>
                    <dd class="mt-1 text-gray-900">{message.authorName || 'Actor unavailable'}</dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Published</dt>
                    <dd class="mt-1 text-gray-900">{message.createdAt ? message.createdAt.toLocaleString() : 'Timestamp unavailable'}</dd>
                  </div>
                </dl>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
