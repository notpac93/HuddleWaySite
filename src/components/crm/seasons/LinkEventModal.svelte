<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { tenantIdStore } from '../../../lib/authStore';
  import { backendClient } from '../../../lib/api/backendClient';
  import { BackendApiError, createIdempotencyKey } from '../../../lib/api/BackendApi';
  import {
    eventsProjectionScope,
    eventsStore,
  } from '../../../lib/services/DataStore';
  import StatusButton from '../ui/StatusButton.svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';

  export let season: any = null;

  const dispatch = createEventDispatcher();

  let linkStates: Record<string, 'idle' | 'loading' | 'success' | 'error'> = {};
  let isSubmitting = false;
  let searchQuery = '';
  let errorMessage = '';
  let auditReason = '';
  let lastPayloadSignature = '';
  let lastOperationKey = createIdempotencyKey('event-season-link');
  let operationGeneration = 0;

  $: normalizedEvents = $eventsStore.map((event) => ({
    ...event,
    id: String(event?.id || '').trim(),
    title: String(event?.title || 'Event title unavailable'),
  }));
  $: malformedEventCount =
    normalizedEvents.filter((event) => !event.id).length;
  $: availableEvents = normalizedEvents.filter((event) =>
    event.id
    && !event.seasonId
    && (
      !searchQuery
      || event.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function buildPayloadSignature(eventId: string) {
    return JSON.stringify({
      tenantId: $tenantIdStore,
      seasonId: String(season?.id || '').trim(),
      eventId,
      auditReason: auditReason.trim(),
    });
  }

  async function linkEvent(eventId: string) {
    const seasonId = String(season?.id || '').trim();
    const normalizedEventId = String(eventId || '').trim();
    const tenantId = $tenantIdStore;
    if (!seasonId || !normalizedEventId || !tenantId || isSubmitting) return;
    if (auditReason.trim().length < 3) {
      errorMessage = 'Provide a reason for linking this event.';
      return;
    }
    const generation = ++operationGeneration;
    const submittedSignature = buildPayloadSignature(normalizedEventId);
    if (submittedSignature !== lastPayloadSignature) {
      lastPayloadSignature = submittedSignature;
      lastOperationKey = createIdempotencyKey('event-season-link');
    }
    const operationKey = lastOperationKey;
    isSubmitting = true;
    linkStates = { ...linkStates, [normalizedEventId]: 'loading' };
    errorMessage = '';
    try {
      await backendClient.updateEvent(
        tenantId,
        normalizedEventId,
        { seasonId },
        auditReason.trim(),
        operationKey,
      );
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(season?.id || '').trim() !== seasonId
        || buildPayloadSignature(normalizedEventId) !== submittedSignature
      ) return;
      linkStates = { ...linkStates, [normalizedEventId]: 'success' };
    } catch (error) {
      if (
        generation !== operationGeneration
        || $tenantIdStore !== tenantId
        || String(season?.id || '').trim() !== seasonId
        || buildPayloadSignature(normalizedEventId) !== submittedSignature
      ) return;
      const supportId =
        error instanceof BackendApiError ? error.requestId : null;
      console.error('Event-to-season link failed.', {
        requestId: supportId || 'unavailable',
      });
      errorMessage = `The event could not be linked.${supportId ? ` Support request: ${supportId}` : ''}`;
      linkStates = { ...linkStates, [normalizedEventId]: 'error' };
    } finally {
      if (generation === operationGeneration) isSubmitting = false;
    }
  }

  function handleCreateNew() {
    if (isSubmitting) return;
    dispatch('createNew');
  }

  function handleClose() {
    if (isSubmitting) return;
    operationGeneration += 1;
    dispatch('close');
  }

  onDestroy(() => {
    operationGeneration += 1;
  });
</script>

<!-- Modal Overlay -->
<div class="crm-ui-modal-root" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="crm-ui-modal-shell">

    <button type="button" disabled={isSubmitting} class="crm-ui-backdrop" aria-label="Cancel event linking" tabindex="-1" on:click={handleClose}></button>
    <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>

    <div class="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-y-auto shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full max-h-[calc(100vh-2rem)]" tabindex="-1" use:modalFocus={{ onEscape: handleClose }}>

      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center mb-5">
          <h3 class="text-xl leading-6 font-semibold text-gray-900" id="modal-title">
            Add Events to {season?.name || season?.title || 'Season'}
          </h3>
          <button type="button" disabled={isSubmitting} class="text-gray-400 hover:text-gray-500 disabled:opacity-50" on:click={handleClose}>
            <span class="sr-only">Close</span>
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mb-4">
          <button type="button" disabled={isSubmitting} on:click={handleCreateNew} class="w-full flex justify-center items-center py-3 px-4 border-2 border-dashed border-[#1855c5] rounded-md text-[#1855c5] hover:bg-blue-50 font-medium transition-colors disabled:opacity-50">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            Create New Event
          </button>
        </div>

        <div class="relative mb-4">
          <div class="crm-ui-search-icon">
            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input
            type="text"
            bind:value={searchQuery}
            disabled={isSubmitting}
            class="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#1855c5] focus:ring-1 focus:ring-[#1855c5]"
            placeholder="Search existing unlinked events..."
          >
        </div>

        <div class="mb-4">
          <label for="link-event-audit-reason" class="crm-ui-label">Reason for change *</label>
          <input id="link-event-audit-reason" type="text" bind:value={auditReason} disabled={isSubmitting} minlength="3" maxlength="500" required class="crm-ui-field" placeholder="Why are these events being linked?">
        </div>

        {#if errorMessage}
          <p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>
        {/if}
        {#if $eventsProjectionScope.truncated}
          <p class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            Only the first {$eventsProjectionScope.limit} events are loaded. Search results may be incomplete.
          </p>
        {/if}
        {#if malformedEventCount > 0}
          <p class="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {malformedEventCount} malformed event {malformedEventCount === 1 ? 'record was' : 'records were'} omitted because no stable identifier was available.
          </p>
        {/if}

        <div class="overflow-y-auto flex-1 border border-gray-200 rounded-md">
          {#if $eventsProjectionScope.loading}
            <div class="p-8 text-center text-gray-500" role="status">
              Loading unlinked events…
            </div>
          {:else if $eventsProjectionScope.error}
            <div class="p-8 text-center text-red-700" role="alert">
              {$eventsProjectionScope.error}
            </div>
          {:else if availableEvents.length === 0}
            <div class="p-8 text-center text-gray-500">
              <p>No unlinked events available.</p>
              <p class="text-sm mt-1">Create a new event to add it to this season.</p>
            </div>
          {:else}
            <ul class="divide-y divide-gray-200">
              {#each availableEvents as event (event.id)}
                <li class="p-4 hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <h4 class="text-sm font-semibold text-[#0f2142]">{event.title}</h4>
                    <p class="text-xs text-gray-500 mt-1">
                      {event.date ? (event.date.toDate ? event.date.toDate() : new Date(event.date)).toLocaleDateString() : 'No date'}
                      {#if event.type}<span class="mx-1">•</span>{event.type}{/if}
                    </p>
                  </div>
                  <StatusButton
                    state={linkStates[event.id] || 'idle'}
                    on:click={() => linkEvent(event.id)}
                    disabled={isSubmitting || auditReason.trim().length < 3}
                    idleText="Link to Season"
                    loadingText="Linking..."
                    successText="Linked!"
                    errorText="Retry Link"
                    class="px-3 py-1.5 border border-[#1855c5] text-[#1855c5] rounded text-sm font-medium hover:bg-[#1855c5] hover:text-white transition-colors disabled:opacity-50"
                  />
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
      <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
        <button
          type="button"
          class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
          disabled={isSubmitting}
          on:click={handleClose}
        >
          Done
        </button>
      </div>
    </div>
  </div>
</div>
