<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import type { MessageAudiencePreview } from '../../../lib/api/RegistrationOutreachApi';
  import Icon from '../ui/Icon.svelte';
  export let subject = '';
  export let body = '';
  export let preview: MessageAudiencePreview;
  export let connectedEmail = '';
  export let deliveryMode: 'huddleway' | 'connected_mailbox' = 'huddleway';
  export let busy = false;
  export let sendingAvailable = true;
  export let onCancel: () => void;
  export let onConfirm: () => void;
  export let onSender: () => void;
</script>

<div class="crm-ui-modal-root crm-email-review-modal" role="dialog" aria-modal="true" aria-labelledby="email-review-title">
  <div class="flex min-h-full items-center justify-center p-4">
    <button type="button" class="crm-ui-backdrop" aria-label="Close email review" tabindex="-1" disabled={busy} on:click={onCancel}></button>
    <div class="crm-announcement-review crm-message-dialog crm-theme-default-host crm-auth-card" tabindex="-1" use:modalFocus={{ onEscape: () => { if (!busy) onCancel(); } }}>
      <header class="crm-announcement-review-heading"><h3 id="email-review-title">Review email</h3><button type="button" class="crm-compose-icon" aria-label="Close review" disabled={busy} on:click={onCancel}><Icon name="close" size={20} /></button></header>
      <div class="crm-email-review-address"><label for="email-review-sender">From</label><select id="email-review-sender" bind:value={deliveryMode} disabled={busy || preview.emailEligibleCount > 100}><option value="huddleway">HuddleWay</option><option value="connected_mailbox" disabled={!connectedEmail}>{connectedEmail || 'My email'}</option></select><button type="button" class="crm-compose-icon" aria-label="Email connection" disabled={busy} on:click={onSender}><Icon name="menu" size={20} /></button></div>
      <div class="crm-email-review-counts"><span>{preview.emailEligibleCount.toLocaleString()} {preview.emailEligibleCount === 1 ? 'recipient' : 'recipients'}</span>{#if preview.emailSuppressedCount}<span>{preview.emailSuppressedCount.toLocaleString()} opted out</span>{/if}</div>
      <article class="crm-announcement-review-message" aria-label="Email content preview"><h4>{subject || 'Program update'}</h4><p>{body}</p></article>
      <details class="crm-delivery-details"><summary>Delivery details</summary><dl><div><dt>Addresses</dt><dd>{preview.uniqueRecipientCount.toLocaleString()}</dd></div><div><dt>Opted out</dt><dd>{preview.emailSuppressedCount.toLocaleString()}</dd></div>{#if deliveryMode === 'connected_mailbox'}<div><dt>Send limit</dt><dd>100 recipients</dd></div>{:else if preview.monthlyAllowanceVisible}<div><dt>Monthly allowance</dt><dd>{preview.tenantEmailRemaining.toLocaleString()} of {preview.tenantEmailMonthlyLimit.toLocaleString()} left</dd></div><div><dt>After sending</dt><dd>{Math.max(0, preview.tenantEmailRemaining - preview.emailEligibleCount).toLocaleString()} left</dd></div><div><dt>Resets</dt><dd>{new Date(preview.tenantEmailResetsAt).toLocaleDateString()}</dd></div>{:else}<div><dt>Send limit</dt><dd>100 recipients</dd></div>{/if}</dl></details>
      {#if !sendingAvailable}<p class="crm-compose-error" role="alert">Sending is unavailable for this sender.</p>{/if}
      {#if !preview.emailEligibleCount}<p class="crm-compose-error" role="alert">No eligible recipients.</p>{/if}
      <footer class="crm-announcement-review-actions"><button type="button" class="crm-auth-button-secondary" disabled={busy} on:click={onCancel}>Back to editing</button><button type="button" class="crm-auth-button-primary" disabled={busy || !preview.emailEligibleCount || !sendingAvailable} on:click={onConfirm}>{busy ? 'Sending…' : 'Send email'}</button></footer>
    </div>
  </div>
</div>
