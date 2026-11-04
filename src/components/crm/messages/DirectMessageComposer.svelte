<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { fullscreenMessage } from './fullscreenMessage';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';
  export let body = '';
  export let recipients = '';
  export let contacts: Array<{ email: string; name: string }> = [];
  export let chatMessages: Array<{ id: string; body: string; sentAt: string; status: string }> = [];
  export let busy = false;
  export let valid = false;
  const dispatch = createEventDispatcher<{ send: void; close: void }>();
  let started = false;
  let messageField: HTMLTextAreaElement | undefined;
  $: if (!body && messageField) messageField.style.height = 'auto';
  let query = '';
  $: email = recipients.trim().toLowerCase();
  $: validPerson = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email);
  $: name = contacts.find((person) => person.email.toLowerCase() === email)?.name || email;
  $: people = contacts.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  function start(address: string) { recipients = address.trim().toLowerCase(); started = true; void tick().then(() => messageField?.focus()); }
  function followLatest(node: HTMLElement, count: number) {
    const scroll = () => { void tick().then(() => { node.scrollTop = node.scrollHeight; }); };
    scroll();
    return { update(next: number) { if (next !== count) { count = next; scroll(); } } };
  }
</script>

<!-- Keep the Svelte-owned block anchor in place while the screen is portaled. -->
<div class="crm-message-screen-anchor">
<div class="crm-fullscreen-message crm-direct-screen crm-theme-default-host" aria-label={started ? `Chat with ${name}` : 'New direct message'} role="dialog" aria-modal="true" tabindex="-1" use:fullscreenMessage use:modalFocus={{ onEscape: () => { if (!busy) dispatch('close'); } }}>
  <header class="crm-fullscreen-heading">
    <button type="button" class="crm-compose-icon" aria-label="Back to inbox" disabled={busy} on:click={() => dispatch('close')}><Icon name="chevronRight" size={24} className="crm-message-back-arrow" /></button>
    {#if started}
      <span class="crm-chat-person-avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()}</span>
      <div class="crm-chat-person"><h3>{name}</h3><span>Direct message · In app</span></div>
    {:else}<h3>New direct message</h3>{/if}
  </header>
  {#if !started}
    <div class="crm-chat-choose">
      <label class="crm-compose-contact-search"><Icon name="search" size={20} /><input type="search" aria-label="Search people" placeholder="Search people" bind:value={query} /></label>
      <div class="crm-chat-people">{#each people as person}<button type="button" on:click={() => start(person.email)}><span class="crm-chat-person-avatar" aria-hidden="true">{person.name.slice(0,1).toUpperCase()}</span><span><strong>{person.name}</strong><small>{person.email}</small></span><Icon name="chevronRight" size={20} /></button>{/each}</div>
      <form class="crm-chat-manual" on:submit|preventDefault={() => { if (validPerson) start(email); }}>
        <label for="direct-person">Account email</label><input id="direct-person" aria-label="Recipient emails" type="email" bind:value={recipients} placeholder="name@example.com" />
        <button type="submit" class="crm-auth-button-primary" disabled={!validPerson}>Start chat</button>
      </form>
    </div>
  {:else}
    <div class="crm-direct-timeline" role="log" aria-label="Conversation" aria-live="polite" use:followLatest={chatMessages.length}>
      <span class="crm-chat-date">{chatMessages.length ? 'Conversation' : 'New conversation'}</span>
      {#if !chatMessages.length}<div class="crm-direct-empty"><span class="crm-chat-person-avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()}</span><strong>{name}</strong><small>{email}</small></div>{/if}
      {#each chatMessages as message (message.id)}<div class="crm-direct-outgoing"><p>{message.body}</p><small>{message.sentAt ? new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''} · {message.status}</small></div>{/each}
    </div>
    <form class="crm-direct-input" on:submit|preventDefault={() => dispatch('send')}>
      <label for="direct-message-body" class="sr-only">Message</label><textarea bind:this={messageField} id="direct-message-body" bind:value={body} maxlength="4000" rows="1" placeholder="Message…" disabled={busy} on:input={(event) => { const field = event.currentTarget; field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 160)}px`; }}></textarea>
      <button type="submit" class="crm-auth-button-primary" aria-label="Send message" disabled={!valid || busy}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></button>
    </form>
  {/if}
  <slot />
</div>
</div>
