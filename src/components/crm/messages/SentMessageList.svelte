<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  export type SentItem = { id: string; kind: 'email' | 'direct' | 'announcement'; subject: string; body: string; createdAt: string; status: string; recipientCount?: number; association?: string; sourceId?: string };
  export let items: SentItem[] = [];
  export let loading = false;
  export let error = '';
  export let busyId = '';
  const dispatch = createEventDispatcher<{ edit: string; remove: string; retry: void }>();
  let kind: 'all' | SentItem['kind'] = 'all';
  let query = '';
  let searchOpen = false;
  let expanded = '';
  const types = [{ id: 'all', label: 'All' }, { id: 'email', label: 'Email' }, { id: 'direct', label: 'Messages' }, { id: 'announcement', label: 'Announcements' }] as const;
  $: visible = items.filter((item) => (kind === 'all' || item.kind === kind) && (!query.trim() || `${item.subject} ${item.body}`.toLowerCase().includes(query.trim().toLowerCase())));
  const label = (type: SentItem['kind']) => type === 'direct' ? 'Message' : type === 'announcement' ? 'Announcement' : 'Email';
</script>

<section class="crm-sent-list crm-auth-card" aria-label="Sent messages">
  <header class="crm-sent-toolbar"><div class="crm-sent-filters" role="group" aria-label="Message type">{#each types as type}<button type="button" aria-pressed={kind === type.id} on:click={() => kind = type.id}>{type.label}</button>{/each}</div><button type="button" class="crm-compose-icon" aria-label={searchOpen ? 'Close sent search' : 'Search sent messages'} aria-expanded={searchOpen} on:click={() => { searchOpen = !searchOpen; if (!searchOpen) query = ''; }}><Icon name="search" size={20} /></button></header>
  {#if searchOpen}<label class="crm-sent-search"><span class="sr-only">Search sent messages</span><input type="search" bind:value={query} placeholder="Search messages" /></label>{/if}
  {#if loading}<p class="crm-sent-empty" role="status">Loading…</p>{:else if error}<div class="crm-sent-empty" role="alert"><p>{error}</p><button type="button" class="crm-auth-link" on:click={() => dispatch('retry')}>Try again</button></div>{/if}
  {#if !loading && !visible.length}<p class="crm-sent-empty">{query || kind !== 'all' ? 'No matches' : 'No sent messages'}</p>{/if}
  <ul>{#each visible as item (item.id)}<li class="crm-sent-item"><button type="button" class="crm-sent-row" aria-expanded={expanded === item.id} on:click={() => expanded = expanded === item.id ? '' : item.id}><span class="crm-sent-type-icon"><Icon name={item.kind === 'direct' ? 'messages' : item.kind === 'email' ? 'pencil' : 'events'} size={20} /></span><span class="crm-sent-row-copy"><span class="crm-sent-title"><strong>{item.subject || label(item.kind)}</strong><time datetime={item.createdAt || undefined}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</time></span><span class="crm-sent-preview">{item.body}</span><span class="crm-sent-meta"><span>{label(item.kind)}</span><span>{item.status}</span>{#if item.recipientCount && item.recipientCount > 1}<span>{item.recipientCount} recipients</span>{/if}</span></span></button>{#if expanded === item.id}<div class="crm-sent-expanded"><p>{item.body}</p>{#if item.association}<small>{item.association}</small>{/if}{#if item.kind === 'announcement' && item.sourceId}<div class="crm-sent-row-actions"><button type="button" class="crm-auth-link" disabled={Boolean(busyId)} on:click={() => dispatch('edit', item.sourceId!)}>Edit announcement</button><button type="button" class="crm-ui-message-delete" disabled={Boolean(busyId)} on:click={() => dispatch('remove', item.sourceId!)}>{busyId === item.sourceId ? 'Deleting…' : 'Delete'}</button></div>{/if}</div>{/if}</li>{/each}</ul>
</section>
