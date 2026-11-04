<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { announcementImportanceOptions, type AnnouncementImportance, type AttachmentScope } from '../../../lib/ui/announcementAssociation';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { fullscreenMessage } from './fullscreenMessage';
  import Icon from '../ui/Icon.svelte';
  import StatusButton from '../ui/StatusButton.svelte';
  export let subject = '';
  export let body = '';
  export let scope: AttachmentScope = 'all';
  export let audienceVisibility: 'everyone' | 'event_registrants' = 'everyone';
  export let importance: AnnouncementImportance = 'routine';
  export let selectedTeamIds: string[] = [];
  export let selectedEventIds: string[] = [];
  export let selectedSeasonIds: string[] = [];
  export let teams: Array<{ id: string; title: string }> = [];
  export let events: Array<{ id: string; title: string }> = [];
  export let seasons: Array<{ id: string; title: string }> = [];
  export let editing = false;
  export let busy = false;
  export let valid = false;
  export let saved = false;
  export let state: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  const dispatch = createEventDispatcher<{ scope: AttachmentScope; association: { kind: 'team' | 'event' | 'season'; ids: string[] }; review: void; cancel: void; close: void }>();
  let pickerOpen = false;
  let optionsOpen = false;
  let query = '';
  let registeredOnly = audienceVisibility === 'event_registrants';
  $: audienceVisibility = scope === 'event' && registeredOnly ? 'event_registrants' : 'everyone';
  $: choices = scope === 'team' ? teams : scope === 'event' ? events : scope === 'season' ? seasons : [];
  $: selected = scope === 'team' ? selectedTeamIds : scope === 'event' ? selectedEventIds : scope === 'season' ? selectedSeasonIds : [];
  $: visibleChoices = choices.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  $: audience = scope === 'all' ? 'All users' : selected.length === 0 ? 'Choose audience' : selected.length === 1 ? choices.find((item) => item.id === selected[0])?.title || '1 selected' : `${selected.length} ${scope === 'team' ? 'teams' : scope === 'season' ? 'seasons' : 'events'}`;
  $: locked = busy || (editing && audienceVisibility === 'event_registrants');
  function changeScope(value: AttachmentScope) { if (value === scope) return; query = ''; registeredOnly = false; dispatch('scope', value); }
  function toggle(id: string) {
    if (scope === 'all') return;
    dispatch('association', { kind: scope, ids: selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id] });
  }
</script>

<!-- Keep the Svelte-owned block anchor in place while the screen is portaled. -->
<div class="crm-message-screen-anchor">
<div class="crm-compose-sheet crm-auth-card crm-fullscreen-message crm-theme-default-host crm-announcement-note" aria-labelledby="announcement-composer-title" role="dialog" aria-modal="true" tabindex="-1" use:fullscreenMessage use:modalFocus={{ onEscape: () => { if (!busy && !pickerOpen) dispatch('close'); } }}>
  <header class="crm-note-heading">
    <button type="button" class="crm-compose-icon" aria-label="Back to inbox" disabled={busy} on:click={() => dispatch('close')}><Icon name="chevronRight" size={24} className="crm-message-back-arrow" /></button>
    <span>{editing ? 'Edit announcement' : 'Draft'}</span>
    <div class="crm-note-options"><button type="button" class="crm-auth-link" aria-expanded={optionsOpen} aria-controls="announcement-options" disabled={busy} on:click={() => optionsOpen = !optionsOpen}>Options <Icon name="menu" size={18} /></button>
      {#if optionsOpen}<div id="announcement-options" class="crm-note-options-panel"><label for="announcement-priority">Priority<select id="announcement-priority" bind:value={importance} disabled={busy}>{#each announcementImportanceOptions as option}<option value={option.value}>{option.label}</option>{/each}</select></label><button type="button" class="crm-compose-discard" disabled={busy} on:click={() => dispatch('cancel')}><Icon name="trash" size={18} /> Discard draft</button></div>{/if}
    </div>
  </header>
  <div class="crm-note-canvas">
    <h3 id="announcement-composer-title">{editing ? 'Edit announcement' : 'Announcement'}</h3>
    <label for="announcement-subject" class="sr-only">Subject</label><input id="announcement-subject" class="crm-note-title" bind:value={subject} maxlength="200" placeholder="Add a title (optional)" disabled={busy} />
    <label for="announcement-body" class="sr-only">Message</label><textarea id="announcement-body" class="crm-note-body" bind:value={body} maxlength="4000" placeholder="Write your announcement…" disabled={busy}></textarea>
  </div>
  <slot />
  <footer class="crm-note-footer">
    <button type="button" class="crm-note-audience" aria-label={`Audience: ${audience}`} aria-haspopup="dialog" disabled={busy} on:click={() => { pickerOpen = true; optionsOpen = false; }}><Icon name="teams" size={20} /><span>{audience}{#if audienceVisibility === 'event_registrants'}<small>Registered only</small>{/if}</span><Icon name="chevronRight" size={16} /></button>
    <StatusButton type="button" {state} disabled={!valid || busy} idleText={editing ? 'Save changes' : 'Review'} loadingText={editing ? 'Saving…' : 'Reviewing…'} successText={editing ? 'Updated' : 'Published'} errorText={saved ? 'Check status' : 'Review'} class="crm-auth-button-primary" on:click={() => dispatch('review')} />
  </footer>
  {#if pickerOpen}
    <div class="crm-note-picker-overlay">
      <button type="button" class="crm-note-picker-shade" aria-label="Close audience picker" tabindex="-1" on:click={() => pickerOpen = false}></button>
      <div class="crm-note-picker" role="dialog" aria-modal="true" aria-labelledby="announcement-audience-title" tabindex="-1" use:modalFocus={{ onEscape: () => pickerOpen = false }}>
        <header><h4 id="announcement-audience-title">Audience</h4><button type="button" class="crm-compose-icon" aria-label="Close audience" on:click={() => pickerOpen = false}><Icon name="close" size={22} /></button></header>
        <div class="crm-note-scopes" role="group" aria-label="Post on">{#each [{ id: 'all', label: 'All users' }, { id: 'team', label: 'Teams' }, { id: 'season', label: 'Seasons' }, { id: 'event', label: 'Events' }] as target}<button type="button" aria-pressed={scope === target.id} disabled={locked} on:click={() => changeScope(target.id as AttachmentScope)}>{target.label}</button>{/each}</div>
        {#if scope !== 'all'}
          <div class="crm-note-selection-count"><span>{scope === 'team' ? 'Teams' : scope === 'season' ? 'Seasons' : 'Events'}</span><span>{selected.length} selected</span></div>
          {#if choices.length > 6}<input type="search" aria-label="Search audience" placeholder="Search" bind:value={query} />{/if}
          <div class="crm-note-checklist">{#each visibleChoices as item}<label><input type="checkbox" checked={selected.includes(item.id)} disabled={locked || (!selected.includes(item.id) && selected.length >= 50)} on:change={() => toggle(item.id)} /><span>{item.title}</span></label>{/each}{#if !visibleChoices.length}<p>{choices.length ? 'No matches' : 'None available'}</p>{/if}</div>
          {#if scope === 'event'}<label class="crm-note-registered"><input type="checkbox" bind:checked={registeredOnly} disabled={busy || editing} />Registered only</label>{/if}
        {/if}
        <button type="button" class="crm-auth-button-primary crm-note-done" disabled={scope !== 'all' && !selected.length} on:click={() => pickerOpen = false}>Done</button>
      </div>
    </div>
  {/if}
</div>
</div>
