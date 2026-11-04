<script lang="ts">
  import { toast } from './ui/toast';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { onMount as mountRefresh } from 'svelte';
  import { createEventDispatcher, onMount } from 'svelte';
  import { tenantIdStore } from '../../lib/authStore';
  import { backendClient } from '../../lib/api/backendClient';
  import {
    BackendApiError,
    type AdminInboxThread,
  } from '../../lib/api/BackendApi';

  import Icon from './ui/Icon.svelte';
  import './messages/messaging.css';

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
  let filtersOpen = false;
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

  function isUnread(thread: AdminInboxThread, viewed = viewedThreadIds) {
    return isAwaitingReply(thread) && !viewed.has(viewKey(thread));
  }

  function viewKey(thread: AdminInboxThread) {
    return `${thread.id}:${lastMessage(thread)?.id || thread.lastMessageAt || ''}`;
  }

  function initials(thread: AdminInboxThread) {
    return (thread.consumerName || thread.consumerEmail || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
  }

  function threadContext(thread: AdminInboxThread) {
    const teamIds = threadRegistrationIds(thread, 'teamId');
    const eventIds = threadRegistrationIds(thread, 'eventId');
    return [
      ...teams.filter((team) => teamIds.has(team.id)).map((team) => team.name || team.id),
      ...events.filter((event) => eventIds.has(event.id)).map((event) => event.title || event.name || event.id),
    ].slice(0, 2).join(' · ') || 'Program conversation';
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
        || (statusFilter === 'unread' && isUnread(thread, viewedThreadIds))
        || (statusFilter === 'awaiting' && awaiting)
        || (statusFilter === 'replied' && !awaiting);
      const matchesTeam = !teamFilter || threadRegistrationIds(thread, 'teamId').has(teamFilter);
      const matchesEvent = !eventFilter || threadRegistrationIds(thread, 'eventId').has(eventFilter);
      const matchesDate = !sinceDate || Boolean(thread.lastMessageAt && thread.lastMessageAt.slice(0, 10) >= sinceDate);
      return matchesSearch && matchesStatus && matchesTeam && matchesEvent && matchesDate;
    });
  $: unreadCount = threads.filter((thread) => isUnread(thread, viewedThreadIds)).length;
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
    filtersOpen = false;
    search = '';
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
    viewedThreadIds = new Set([...viewedThreadIds, viewKey(thread)]);
    window.localStorage.setItem(`huddleway-inbox-viewed:${tenantId}`, JSON.stringify([...viewedThreadIds]));
    replySubject = thread.subject.toLocaleLowerCase().startsWith('re:')
      ? thread.subject
      : `Re: ${thread.subject || 'Message'}`;
    replyMessage = window.sessionStorage.getItem(`huddleway-inbox-reply:${tenantId}:${thread.id}`) || '';
    replyState = 'idle';
    replyStatus = '';
    replyRequestId = '';
  }

  async function loadThreads(requestedTenantId: string, preserveSelection = true, silent = false) {
    const requestedGeneration = generation;
    const priorSelection = preserveSelection ? selectedThreadId : '';
    if (!silent) loadState = 'loading';
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

  mountRefresh(() => registerLiveRefresh(() => tenantId && loadState !== 'loading' && replyState !== 'loading' ? loadThreads(tenantId, true, true) : undefined));
</script>

<section class="crm-message-inbox crm-auth-card" class:crm-inbox-reading={Boolean(selectedThread)} aria-labelledby="direct-inbox-heading">
  <div class="crm-inbox-controls">
    <div class="crm-inbox-toolbar"><div><h3 id="direct-inbox-heading">Inbox</h3></div><button type="button" class="crm-message-filter-toggle" aria-expanded={filtersOpen} aria-controls="inbox-extra-filters" on:click={() => filtersOpen = !filtersOpen}><Icon name="filter" size={20} />Filters{teamFilter || eventFilter || sinceDate ? ' · Active' : ''}</button></div>
    <label class="crm-inbox-search"><Icon name="search" size={20} /><span class="sr-only">Search conversations</span><input id="direct-inbox-search" type="search" bind:value={search} placeholder="Search people or messages" /></label>
    <div class="crm-inbox-status" role="group" aria-label="Conversation status">
      <button type="button" aria-pressed={statusFilter === 'all'} on:click={() => statusFilter = 'all'}>All · {threads.length}</button>
      <button type="button" aria-pressed={statusFilter === 'unread'} on:click={() => statusFilter = 'unread'}>Unread · {unreadCount}</button>
      <button type="button" aria-pressed={statusFilter === 'awaiting'} on:click={() => statusFilter = 'awaiting'}>Awaiting reply</button>
      <button type="button" aria-pressed={statusFilter === 'replied'} on:click={() => statusFilter = 'replied'}>Replied</button>
    </div>
    {#if filtersOpen}
      <div id="inbox-extra-filters" class="crm-inbox-extra-filters">
        <label>Team<select class="crm-ui-message-select" bind:value={teamFilter}><option value="">All teams</option>{#each teams as team}<option value={team.id}>{team.name || team.id}</option>{/each}</select></label>
        <label>Conversation event<select class="crm-ui-message-select" bind:value={eventFilter}><option value="">All events</option>{#each events as event}<option value={event.id}>{event.title || event.name || event.id}</option>{/each}</select></label>
        <label>Since<input type="date" class="crm-ui-message-field" bind:value={sinceDate} /></label>
        <button type="button" class="crm-auth-link" on:click={() => { teamFilter = ''; eventFilter = ''; sinceDate = ''; }}>Clear filters</button>
      </div>
    {/if}
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
    <div class="crm-inbox-layout">
      <div class="crm-inbox-thread-list">
        {#if visibleThreads.length === 0}
          <p class="p-6 text-center text-sm text-gray-500">No conversations match “{search}”.</p>
        {:else}
          <ul class="divide-y divide-gray-100">
            {#each visibleThreads as thread (thread.id)}
              <li>
                <button
                  type="button"
                  class="crm-inbox-thread {selectedThreadId === thread.id ? 'crm-inbox-thread-selected' : ''}"
                  aria-pressed={selectedThreadId === thread.id}
                  on:click={() => selectThread(thread)}
                >
                  <span class="crm-inbox-avatar" aria-hidden="true">{initials(thread)}</span>
                  <span class="crm-inbox-thread-copy">
                    <span class="crm-inbox-thread-title"><strong>{thread.consumerName || thread.consumerEmail || 'Account holder'}</strong><time datetime={thread.lastMessageAt || undefined}>{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date'}</time></span>
                    <span class="crm-inbox-context">{#if isUnread(thread, viewedThreadIds)}<span class="crm-inbox-unread-dot" aria-label="Unread"></span>{/if}{threadContext(thread)}</span>
                    <span class="crm-inbox-subject">{thread.subject || 'Message'}</span>
                    <span class="crm-inbox-snippet">{lastMessageText(thread)}</span>

                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if selectedThread}
        <div class="crm-inbox-detail">
          <div class="crm-inbox-detail-heading">
            <button type="button" class="crm-inbox-back crm-auth-link" on:click={() => selectedThreadId = ''}><Icon name="chevronLeft" size={20} />Back to conversations</button>
            <h4 class="font-semibold text-gray-950">{selectedThread.subject || 'Direct conversation'}</h4>
            <p class="text-sm text-gray-500">{selectedThread.consumerName || 'Account holder'} · {selectedThread.consumerEmail}</p>
            <p class="crm-inbox-detail-context">{threadContext(selectedThread)}</p>
          </div>
          <ol class="crm-inbox-messages" aria-label="Conversation messages">
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
          <form class="crm-inbox-reply" on:submit|preventDefault={sendReply}>
            <div>
              <label for="direct-reply-subject" class="crm-ui-label">Subject</label>
              <input id="direct-reply-subject" bind:value={replySubject} maxlength={SUBJECT_LIMIT} class="crm-ui-message-field" />
            </div>
            <div>
              <label for="direct-reply-message" class="crm-ui-label">Reply</label>
              <textarea id="direct-reply-message" bind:value={replyMessage} on:input={saveReplyDraft} maxlength={MESSAGE_LIMIT} rows="3" placeholder="Write a reply…" class="crm-ui-message-field"></textarea>
              <p class="crm-ui-hint">{replyMessage.length}/{MESSAGE_LIMIT} characters</p>
            </div>
            {#if replyStatus}
              <div use:toast={{dismiss: () => replyStatus = ''}} class="rounded-md border px-3 py-2 text-sm {replyState === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}" role={replyState === 'error' ? 'alert' : 'status'}>
                {replyStatus}
              </div>
            {/if}
            <div class="flex justify-end">
              <button type="submit" disabled={!replyIsValid || replyState === 'loading'} class="crm-auth-button-primary">
                {replyState === 'loading' ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        </div>
      {:else}
        <div class="crm-inbox-no-selection"><Icon name="messages" size={32} /><h4>Your conversations, together.</h4><p>Choose a conversation to read and reply.</p></div>
      {/if}
    </div>
  {/if}
</section>
