<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    type AdminInboxThread,
  } from '../../lib/api/BackendApi';

  const SUBJECT_LIMIT = 200;
  const MESSAGE_LIMIT = 4_000;
  const dispatch = createEventDispatcher<{ unreadCount: number }>();

  export let registrations: any[] = [];
  export let teams: any[] = [];
  export let events: any[] = [];

  let tenantId = '';
  let threads: AdminInboxThread[] = [];
  let selectedThreadId = '';
  let search = '';
  let statusFilter: 'all' | 'unread' | 'awaiting' | 'replied' = 'all';
  let teamFilter = '';
  let eventFilter = '';
  let sinceDate = '';
  let viewedThreadIds = new Set<string>();
  let loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let loadMessage = '';
  let loadRequestId = '';
  let replySubject = '';
  let replyMessage = '';
  let replyState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let replyStatus = '';
  let replyRequestId = '';
  let generation = 0;

  function lastMessageText(thread: AdminInboxThread) {
    const count = thread.messages.length;
    return count > 0 ? thread.messages[count - 1]?.message || '' : '';
  }

  function lastMessage(thread: AdminInboxThread) {
    return thread.messages[thread.messages.length - 1] || null;
  }

  function emailForRegistration(record: any) {
    return String(record?.email || record?.participantEmail || record?.payerEmail || record?.guardianEmail || record?.payer?.email || record?.participant?.email || record?.profile?.email || '').trim().toLowerCase();
  }

  function threadRegistrationIds(thread: AdminInboxThread, field: 'teamId' | 'eventId') {
    const email = thread.consumerEmail.trim().toLowerCase();
    return new Set(registrations.filter((record) => emailForRegistration(record) === email).map((record) => String(record?.[field] || '').trim()).filter(Boolean));
  }

  function isAwaitingReply(thread: AdminInboxThread) {
    return lastMessage(thread)?.direction === 'consumer';
  }

  function isUnread(thread: AdminInboxThread) {
    return isAwaitingReply(thread) && !viewedThreadIds.has(thread.id);
  }

  function readViewedThreadIds(storageTenantId: string) {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(`huddleway-inbox-viewed:${storageTenantId}`) || '[]',
      );
      return new Set<string>(
        (Array.isArray(parsed) ? parsed : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      );
    } catch {
      return new Set<string>();
    }
  }

  $: selectedThread = threads.find((thread) => thread.id === selectedThreadId) || null;
  $: normalizedSearch = search.trim().toLocaleLowerCase();
  $: visibleThreads = threads.filter((thread) => {
      const matchesSearch = !normalizedSearch || [
        thread.consumerName,
        thread.consumerEmail,
        thread.subject,
        lastMessageText(thread),
      ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
      const awaiting = isAwaitingReply(thread);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'unread' && isUnread(thread))
        || (statusFilter === 'awaiting' && awaiting)
        || (statusFilter === 'replied' && !awaiting);
      const matchesTeam = !teamFilter || threadRegistrationIds(thread, 'teamId').has(teamFilter);
      const matchesEvent = !eventFilter || threadRegistrationIds(thread, 'eventId').has(eventFilter);
      const matchesDate = !sinceDate || Boolean(thread.lastMessageAt && thread.lastMessageAt.slice(0, 10) >= sinceDate);
      return matchesSearch && matchesStatus && matchesTeam && matchesEvent && matchesDate;
    });
  $: unreadCount = threads.filter(isUnread).length;
  $: dispatch('unreadCount', unreadCount);
  $: replyIsValid = Boolean(
    selectedThread
    && replySubject.trim()
    && replySubject.trim().length <= SUBJECT_LIMIT
    && replyMessage.trim()
    && replyMessage.trim().length <= MESSAGE_LIMIT,
  );

  onMount(() => tenantIdStore.subscribe((nextTenantId) => {
    generation += 1;
    tenantId = nextTenantId || '';
    threads = [];
    selectedThreadId = '';
    statusFilter = 'all';
    teamFilter = '';
    eventFilter = '';
    sinceDate = '';
    viewedThreadIds = readViewedThreadIds(tenantId);
    resetReply();
    if (tenantId) void loadThreads(tenantId);
    else loadState = 'idle';
  }));

  function requestIdFrom(error: unknown) {
    return error instanceof BackendApiError ? error.requestId || '' : '';
  }

  function resetReply() {
    replySubject = '';
    replyMessage = '';
    replyState = 'idle';
    replyStatus = '';
    replyRequestId = '';
  }

  function selectThread(thread: AdminInboxThread) {
    selectedThreadId = thread.id;
    viewedThreadIds = new Set([...viewedThreadIds, thread.id]);
    window.localStorage.setItem(`huddleway-inbox-viewed:${tenantId}`, JSON.stringify([...viewedThreadIds]));
    replySubject = thread.subject.toLocaleLowerCase().startsWith('re:')
      ? thread.subject
      : `Re: ${thread.subject || 'Message'}`;
    replyMessage = window.sessionStorage.getItem(`huddleway-inbox-reply:${tenantId}:${thread.id}`) || '';
    replyState = 'idle';
    replyStatus = '';
    replyRequestId = '';
  }

  async function loadThreads(requestedTenantId: string, preserveSelection = true) {
    const requestedGeneration = generation;
    const priorSelection = preserveSelection ? selectedThreadId : '';
    loadState = 'loading';
    loadMessage = '';
    loadRequestId = '';
    try {
      const result = await backendClient.adminInboxThreads(requestedTenantId);
      if (requestedGeneration !== generation || tenantId !== requestedTenantId) return;
      threads = result.threads;
      selectedThreadId = threads.some((thread) => thread.id === priorSelection)
        ? priorSelection
        : '';
      loadState = 'ready';
      if (result.truncated) {
        loadMessage = 'Only the 500 most recent inbox records are shown.';
      }
    } catch (error) {
      if (requestedGeneration !== generation || tenantId !== requestedTenantId) return;
      loadState = 'error';
      loadMessage = 'Direct conversations could not be loaded. Try again.';
      loadRequestId = requestIdFrom(error);
    }
  }

  async function sendReply() {
    if (!replyIsValid || !selectedThread || replyState === 'loading') return;
    const requestedTenantId = tenantId;
    const requestedThreadId = selectedThread.id;
    const requestedGeneration = generation;
    const relatedRequestId = [...selectedThread.messages]
      .reverse()
      .find((message) => message.direction === 'consumer')?.requestId || null;
    replyState = 'loading';
    replyStatus = '';
    replyRequestId = '';
    try {
      await backendClient.replyAdminInbox({
        tenantId: requestedTenantId,
        consumerEmail: selectedThread.consumerEmail,
        threadRecipientEmail: selectedThread.threadRecipientEmail,
        subject: replySubject.trim(),
        message: replyMessage.trim(),
        requestId: relatedRequestId,
      });
      if (
        requestedGeneration !== generation
        || tenantId !== requestedTenantId
        || selectedThreadId !== requestedThreadId
      ) return;
      replyState = 'success';
      replyStatus = 'Reply sent and added to this conversation.';
      replyMessage = '';
      window.sessionStorage.removeItem(`huddleway-inbox-reply:${tenantId}:${requestedThreadId}`);
      await loadThreads(requestedTenantId);
    } catch (error) {
      if (
        requestedGeneration !== generation
        || tenantId !== requestedTenantId
        || selectedThreadId !== requestedThreadId
      ) return;
      replyState = 'error';
      replyStatus = 'The reply could not be sent. Try again.';
      replyRequestId = requestIdFrom(error);
    }
  }

  function saveReplyDraft() {
    if (!selectedThreadId) return;
    if (replyMessage.trim()) window.sessionStorage.setItem(`huddleway-inbox-reply:${tenantId}:${selectedThreadId}`, replyMessage);
    else window.sessionStorage.removeItem(`huddleway-inbox-reply:${tenantId}:${selectedThreadId}`);
  }
</script>

<section class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="direct-inbox-heading">
  <div class="border-b border-gray-200 p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 id="direct-inbox-heading" class="font-semibold text-gray-900">Direct conversations</h3>
        <p class="crm-ui-hint">Private account-holder messages and program replies. These are separate from public announcements.</p>
      </div>
      <div class="min-w-0 flex-1">
        <label for="direct-inbox-search" class="block text-xs font-medium text-gray-600">Search conversations</label>
        <input id="direct-inbox-search" type="search" bind:value={search} class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-72" />
      </div>
    </div>
    <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label class="text-xs font-medium text-gray-600">Status<select class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" bind:value={statusFilter}><option value="all">All ({threads.length})</option><option value="unread">Unread ({unreadCount})</option><option value="awaiting">Awaiting reply</option><option value="replied">Replied</option></select></label>
      <label class="text-xs font-medium text-gray-600">Team<select class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" bind:value={teamFilter}><option value="">All teams</option>{#each teams as team}<option value={team.id}>{team.name || team.id}</option>{/each}</select></label>
      <label class="text-xs font-medium text-gray-600">Conversation event<select class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" bind:value={eventFilter}><option value="">All events</option>{#each events as event}<option value={event.id}>{event.title || event.name || event.id}</option>{/each}</select></label>
      <label class="text-xs font-medium text-gray-600">Since<input type="date" class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" bind:value={sinceDate} /></label>
    </div>
  </div>

  {#if loadState === 'loading'}
    <p class="p-8 text-center text-sm text-gray-500" role="status">Loading direct conversations…</p>
  {:else if loadState === 'error'}
    <div class="p-8 text-center" role="alert">
      <p class="text-sm text-red-700">{loadMessage}</p>
      <button type="button" class="mt-4 rounded-md border border-gray-300 px-3 py-2 text-sm" on:click={() => loadThreads(tenantId)}>Try again</button>
    </div>
  {:else if threads.length === 0}
    <p class="p-8 text-center text-sm text-gray-500">No direct conversations yet.</p>
  {:else}
    {#if loadMessage}<p class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status">{loadMessage}</p>{/if}
    <div class="grid min-h-[28rem] md:grid-cols-[minmax(16rem,22rem)_1fr]">
      <div class="border-b border-gray-200 md:border-b-0 md:border-r">
        {#if visibleThreads.length === 0}
          <p class="p-6 text-center text-sm text-gray-500">No conversations match “{search}”.</p>
        {:else}
          <ul class="divide-y divide-gray-100">
            {#each visibleThreads as thread (thread.id)}
              <li>
                <button
                  type="button"
                  class="w-full p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--crm-brand-focus)] {selectedThreadId === thread.id ? 'crm-theme-selected' : ''}"
                  aria-pressed={selectedThreadId === thread.id}
                  on:click={() => selectThread(thread)}
                >
                  <span class="block truncate text-sm font-semibold text-gray-950">{thread.consumerName || 'Account holder'}</span>
                  <span class="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold {isUnread(thread) ? 'bg-blue-100 text-blue-800' : isAwaitingReply(thread) ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}">{isUnread(thread) ? 'Unread' : isAwaitingReply(thread) ? 'Awaiting reply' : 'Replied'}</span>
                  <span class="block truncate text-xs text-gray-500">{thread.consumerEmail}</span>
                  <span class="mt-1 block truncate text-sm text-gray-700">{thread.subject || 'Message'}</span>
                  <span class="mt-1 block text-xs text-gray-500">{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString() : 'Timestamp unavailable'}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if selectedThread}
        <div class="flex min-w-0 flex-col">
          <div class="border-b border-gray-200 p-4">
            <h4 class="font-semibold text-gray-950">{selectedThread.subject || 'Direct conversation'}</h4>
            <p class="text-sm text-gray-500">{selectedThread.consumerName || 'Account holder'} · {selectedThread.consumerEmail}</p>
          </div>
          <ol class="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4" aria-label="Conversation messages">
            {#each selectedThread.messages as message (message.id)}
              <li class="flex {message.direction === 'admin' ? 'justify-end' : 'justify-start'}">
                <article class="max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm {message.direction === 'admin' ? 'bg-[var(--crm-brand-control)] text-[var(--crm-on-primary)]' : 'border border-gray-200 bg-white text-gray-900'}">
                  <p class="text-xs font-semibold {message.direction === 'admin' ? 'text-[var(--crm-on-primary)] opacity-80' : 'text-gray-500'}">{message.senderName}</p>
                  <p class="mt-1 whitespace-pre-wrap break-words">{message.message}</p>
                  <time class="mt-2 block text-xs {message.direction === 'admin' ? 'text-[var(--crm-on-primary)] opacity-80' : 'text-gray-500'}">{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Timestamp unavailable'}</time>
                </article>
              </li>
            {/each}
          </ol>
          <form class="space-y-3 border-t border-gray-200 p-4" on:submit|preventDefault={sendReply}>
            <div>
              <label for="direct-reply-subject" class="crm-ui-label">Subject</label>
              <input id="direct-reply-subject" bind:value={replySubject} maxlength={SUBJECT_LIMIT} class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm" />
            </div>
            <div>
              <label for="direct-reply-message" class="crm-ui-label">Reply</label>
              <textarea id="direct-reply-message" bind:value={replyMessage} on:input={saveReplyDraft} maxlength={MESSAGE_LIMIT} rows="4" class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm"></textarea>
              <p class="crm-ui-hint">{replyMessage.length}/{MESSAGE_LIMIT} characters</p>
            </div>
            {#if replyStatus}
              <div class="rounded-md border px-3 py-2 text-sm {replyState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={replyState === 'error' ? 'alert' : 'status'}>
                {replyStatus}
              </div>
            {/if}
            <div class="flex justify-end">
              <button type="submit" disabled={!replyIsValid || replyState === 'loading'} class="rounded-md bg-[var(--crm-brand-control)] px-4 py-2 text-sm font-semibold text-[var(--crm-on-primary)] disabled:opacity-50">
                {replyState === 'loading' ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        </div>
      {:else}
        <div class="grid place-items-center p-8 text-center text-sm text-gray-500">Choose a conversation to read and reply.</div>
      {/if}
    </div>
  {/if}
</section>
