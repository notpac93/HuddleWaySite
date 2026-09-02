<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';

  export let subject = '';
  export let body: string;
  export let audienceCount = 0;
  export let deviceCount = 0;
  export let audienceTruncated = false;
  export let attachment = 'All organization';
  export let busy = false;
  export let onCancel: () => void = () => {};
  export let onConfirm: () => void = () => {};
  let confirmed = false;
</script>

<div class="crm-ui-modal-root" role="dialog" aria-modal="true" aria-labelledby="announcement-review-title">
  <button type="button" class="crm-ui-backdrop" aria-label="Cancel announcement review" tabindex="-1" disabled={busy} on:click={onCancel}></button>
  <span class="crm-ui-modal-spacer" aria-hidden="true">&#8203;</span>
  <div class="relative z-10 inline-block max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white text-left align-bottom shadow-xl sm:my-8 sm:align-middle" tabindex="-1" use:modalFocus={{ onEscape: onCancel }}>
    <header class="border-b border-gray-200 p-6"><h2 id="announcement-review-title" class="text-xl font-semibold text-gray-950">Review app announcement</h2><p class="mt-1 text-sm text-gray-600">No post or push notification is created until you confirm.</p></header>
    <div class="space-y-5 p-6">
      <dl class="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">
        <div><dt class="text-xs font-semibold uppercase text-gray-500">Account audience</dt><dd class="mt-1 font-semibold text-gray-950">{audienceCount.toLocaleString()}{audienceTruncated ? '+' : ''} eligible account{audienceCount === 1 ? '' : 's'}</dd></div>
        <div><dt class="text-xs font-semibold uppercase text-gray-500">Push effect</dt><dd class="mt-1 font-semibold text-gray-950">Up to {deviceCount.toLocaleString()}{audienceTruncated ? '+' : ''} active device{deviceCount === 1 ? '' : 's'}</dd></div>
        <div class="sm:col-span-2"><dt class="text-xs font-semibold uppercase text-gray-500">Attached context</dt><dd class="mt-1 font-semibold text-gray-950">{attachment}</dd></div>
      </dl>
      {#if audienceTruncated}<p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The active-device count reached the protected preview limit. Publication may reach additional eligible devices.</p>{/if}
      <section class="rounded-lg border border-gray-200 p-4" aria-labelledby="announcement-content-title">
        <h3 id="announcement-content-title" class="font-semibold text-gray-950">{subject || 'Program update'}</h3>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{body}</p>
      </section>
      <label class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" bind:checked={confirmed} disabled={busy} class="mt-0.5 h-4 w-4 rounded border-gray-300" /><span>I confirm this content and organization-wide account audience are correct, and I understand active devices may receive a push notification.</span></label>
    </div>
    <footer class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end"><button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button><button type="button" class="crm-ui-button-primary inline-flex items-center gap-2" disabled={busy || !confirmed} on:click={onConfirm}><Icon name="messages" size={16} /> {busy ? 'Publishing…' : 'Confirm and publish'}</button></footer>
  </div>
</div>
