<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import Icon from '../ui/Icon.svelte';
  export let subject = '';
  export let body: string;
  export let audienceCount = 0;
  export let deviceCount = 0;
  export let audienceTruncated = false;
  export let audienceLabel = 'All users';
  export let attachment = 'All organization';
  export let busy = false;
  export let onCancel: () => void = () => {};
  export let onConfirm: () => void = () => {};
</script>

<div class="crm-ui-modal-root crm-announcement-review-root" role="dialog" aria-modal="true" aria-labelledby="announcement-review-title">
  <div class="flex min-h-full items-center justify-center p-4">
    <button type="button" class="crm-ui-backdrop" aria-label="Cancel announcement review" tabindex="-1" disabled={busy} on:click={onCancel}></button>
    <div class="crm-announcement-review crm-message-dialog crm-theme-default-host crm-auth-card" tabindex="-1" use:modalFocus={{ onEscape: () => { if (!busy) onCancel(); } }}>
      <header class="crm-announcement-review-heading"><h2 id="announcement-review-title">Review app announcement</h2><button type="button" class="crm-compose-icon" aria-label="Close announcement review" disabled={busy} on:click={onCancel}><Icon name="close" size={20} /></button></header>
      <div class="crm-announcement-review-meta"><span>{audienceCount.toLocaleString()}{audienceTruncated ? '+' : ''} eligible account{audienceCount === 1 ? '' : 's'}</span><span>Up to {deviceCount.toLocaleString()}{audienceTruncated ? '+' : ''} active device{deviceCount === 1 ? '' : 's'}</span></div>
      <div class="crm-announcement-review-context"><span>{audienceLabel}</span><strong>{attachment}</strong></div>
      {#if audienceTruncated}<p class="crm-announcement-preview-limit" role="status">Audience preview limited; publication may reach additional eligible devices.</p>{/if}
      <article class="crm-announcement-review-message" aria-labelledby="announcement-content-title"><h3 id="announcement-content-title">{subject || 'Program update'}</h3><p>{body}</p></article>
      <footer class="crm-announcement-review-actions"><button type="button" class="crm-auth-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button><button type="button" class="crm-auth-button-primary" disabled={busy} on:click={onConfirm}>{busy ? 'Publishing…' : 'Publish announcement'}</button></footer>
    </div>
  </div>
</div>
