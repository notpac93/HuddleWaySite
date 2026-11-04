<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fullscreenMessage } from './fullscreenMessage';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';
  import StatusButton from '../ui/StatusButton.svelte';

  export let subject = '';
  export let body = '';
  export let recipients = '';
  export let deliveryMode: 'huddleway' | 'connected_mailbox' = 'huddleway';
  export let connectedEmail = '';
  export let contacts: Array<{ email: string; name: string }> = [];
  export let groups: Array<{ id: string; label: string; emails: string[] }> = [];
  export let valid = false;
  export let busy = false;
  export let state: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  export let recipientLimit = 400;
  const dispatch = createEventDispatcher<{ close: void; send: void; review: void; cancel: void; sender: void; registration: void }>();
  let pickerOpen = false;
  let query = '';
  let selectedGroup = '';

  $: addresses = [...new Set(recipients.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  $: invalidAddresses = addresses.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320);
  $: visibleContacts = contacts.filter((contact) => !query.trim() || `${contact.name} ${contact.email}`.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(email: string) {
    const normalized = email.trim().toLowerCase();
    recipients = (addresses.includes(normalized) ? addresses.filter((entry) => entry !== normalized) : [...addresses, normalized]).join('\n');
  }
  function addGroup() {
    const group = groups.find((entry) => entry.id === selectedGroup);
    if (group) recipients = [...new Set([...addresses, ...group.emails])].join('\n');
    selectedGroup = '';
  }
  function recipientName(email: string) { return contacts.find((entry) => entry.email === email)?.name || email; }
</script>

<!-- Keep the Svelte-owned block anchor in place while the screen is portaled. -->
<div class="crm-message-screen-anchor">
<div class="crm-compose-sheet crm-auth-card crm-fullscreen-message crm-theme-default-host" aria-labelledby="compact-composer-title" role="dialog" aria-modal="true" tabindex="-1" use:fullscreenMessage use:modalFocus={{ onEscape: () => { if (!busy) dispatch('close'); } }}>
  <header class="crm-compose-heading"><button type="button" class="crm-compose-icon" aria-label="Back to inbox" disabled={busy} on:click={() => dispatch('close')}><Icon name="chevronRight" size={24} className="crm-message-back-arrow" /></button><span class="crm-compose-symbol"><Icon name={'pencil'} size={20} /></span><h3 id="compact-composer-title">New email</h3><span class="crm-compose-channel">Email</span></header>
    <div class="crm-compose-row"><label for="compact-sender">From</label><select id="compact-sender" bind:value={deliveryMode} disabled={busy}><option value="huddleway">HuddleWay</option><option value="connected_mailbox" disabled={!connectedEmail || addresses.length > 100}>{connectedEmail || 'My email'}</option></select><button type="button" class="crm-compose-icon" disabled={busy} aria-label="Email connection" on:click={() => dispatch('sender')}><Icon name="menu" size={20} /></button></div>
  <div class="crm-compose-row crm-compose-to"><span id="compact-to-label">To</span><div class="crm-compose-recipients" aria-labelledby="compact-to-label">{#each addresses as email}<span class="crm-compose-chip" class:crm-compose-chip-invalid={invalidAddresses.includes(email)}><span>{recipientName(email)}</span><button type="button" disabled={busy} aria-label={`Remove ${recipientName(email)}`} on:click={() => toggle(email)}><Icon name="close" size={16} /></button></span>{/each}<button type="button" class="crm-compose-add" disabled={busy} aria-expanded={pickerOpen} aria-controls="compact-recipient-picker" on:click={() => pickerOpen = !pickerOpen}>{#if addresses.length}<Icon name="plus" size={20} /><span class="sr-only">Add recipients</span>{:else}Add recipients<Icon name="plus" size={20} />{/if}</button></div></div>
  {#if pickerOpen}
    <section id="compact-recipient-picker" class="crm-compose-picker" aria-label="Recipients">
      <div class="crm-compose-picker-heading"><h4>Recipients</h4><button type="button" class="crm-auth-link" on:click={() => pickerOpen = false}>Done</button></div>
      {#if contacts.length}
        <label class="crm-compose-contact-search"><Icon name="search" size={20} /><input aria-label="Search recipients" type="search" bind:value={query} placeholder="Search people" disabled={busy} /></label>
        <div class="crm-compose-contact-list">{#each visibleContacts as contact}<label><input type="checkbox" checked={addresses.includes(contact.email)} disabled={busy} on:change={() => toggle(contact.email)} /><span><strong>{contact.name}</strong>{#if contact.name !== contact.email}<small>{contact.email}</small>{/if}</span></label>{/each}{#if !visibleContacts.length}<p>No matches</p>{/if}</div>
      {/if}
      {#if groups.length}<div class="crm-compose-group"><select aria-label="Recipient group" bind:value={selectedGroup} disabled={busy}><option value="">Add a group</option>{#each groups as group}<option value={group.id}>{group.label} · {group.emails.length}</option>{/each}</select><button type="button" class="crm-auth-link" disabled={!selectedGroup || busy} on:click={addGroup}>Add</button></div>{/if}
      <label for="compact-addresses" class="crm-ui-label">Email addresses</label>
      <textarea id="compact-addresses" aria-label="Recipient emails" bind:value={recipients} rows="2" placeholder="name@example.com" disabled={busy} class="crm-ui-message-field" aria-invalid={invalidAddresses.length > 0}></textarea>
    </section>
  {/if}
  {#if invalidAddresses.length}<p class="crm-compose-error" role="alert">Check {invalidAddresses.length === 1 ? 'this email address' : 'these email addresses'}: {invalidAddresses.join(', ')}</p>{/if}
  {#if addresses.length > recipientLimit}<p class="crm-compose-error" role="alert">Select up to {recipientLimit} recipients.</p>{/if}
  <div class="crm-compose-row"><label for="compact-subject">Subject</label><input id="compact-subject" bind:value={subject} maxlength="200" placeholder="Add a subject" disabled={busy} /></div>
  <div class="crm-compose-writing"><label for="compact-body" class="sr-only">Message</label><textarea id="compact-body" bind:value={body} maxlength="4000" placeholder="Write your message…" disabled={busy}></textarea></div>
  <footer class="crm-compose-footer"><button type="button" class="crm-compose-discard" disabled={busy} aria-label="Discard draft" on:click={() => dispatch('cancel')}><Icon name="trash" size={20} /></button><span>{addresses.length ? `${addresses.length} recipient${addresses.length === 1 ? '' : 's'}` : ''}</span><button type="button" class="crm-compose-discard" disabled={busy} aria-label="Add registration link" on:click={() => dispatch('registration')}><Icon name="registration" size={20} /></button><StatusButton type="button" {state} disabled={!valid || busy} idleText="Review email" loadingText="Reviewing…" errorText="Review email" class="crm-auth-button-primary" on:click={() => dispatch('review')} /></footer>
  <slot />
</div>
</div>
