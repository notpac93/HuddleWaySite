<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';

  export let events: any[] = [];
  export let teamNames: Record<string, string> = {};
  export let busy = false;
  export let onCancel: () => void = () => {};
  export let onConfirm: () => void = () => {};
  let confirmed = false;
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="batch-publish-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Cancel batch publication" tabindex="-1" disabled={busy} on:click={onCancel}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6">
      <h2 id="batch-publish-title" class="text-xl font-semibold text-gray-950">Review {events.length} event{events.length === 1 ? '' : 's'} before publication</h2>
      <p class="mt-1 text-sm text-gray-600">Publication makes these drafts visible to their configured team audiences.</p>
    </header>
    <div class="space-y-3 p-6">
      {#each events as event (event.id)}
        <article class="rounded-lg border border-gray-200 p-4">
          <div class="flex items-start justify-between gap-4"><h3 class="font-semibold text-gray-950">{event.title}</h3><span class="text-xs font-semibold text-gray-600">{teamNames[event.teamId] || 'Program-wide'}</span></div>
          <p class="mt-1 text-sm text-gray-600">{event.date}</p>
          <div class="mt-3 flex flex-wrap gap-2 text-xs">
            <span class="rounded-full px-2 py-1 {event.registrationFormId ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}">{event.registrationFormId ? 'Registration attached' : 'No registration form'}</span>
            <span class="rounded-full px-2 py-1 {event.imageUrl ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}">{event.imageUrl ? 'Image attached' : 'No image'}</span>
          </div>
        </article>
      {/each}
      <label class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <input type="checkbox" bind:checked={confirmed} disabled={busy} class="mt-0.5 h-4 w-4 rounded border-gray-300" />
        <span>I reviewed the event count, dates, team audiences, and missing registration or image information.</span>
      </label>
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
      <button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onCancel}>Back to events</button>
      <button type="button" class="crm-ui-button-primary inline-flex items-center gap-2" disabled={busy || !confirmed} on:click={onConfirm}><Icon name="check" size={16} /> {busy ? 'Publishing…' : `Publish ${events.length} event${events.length === 1 ? '' : 's'}`}</button>
    </footer>
  </div>
</div>
