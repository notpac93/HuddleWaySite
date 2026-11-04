<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { activeFormQuestionCount, formDateLabel, formStatusLabel } from '../../../lib/registration/registrationFormList';
  export let forms: any[] = [];
  export let loading = false;
  export let error = '';
  export let emptyMessage = 'No registration forms in this view.';
  const dispatch = createEventDispatcher();
</script>
{#if loading}<p role="status" class="list-message">Loading records…</p>
{:else if error}<p role="alert" class="list-message">{error}</p>
{:else if !forms.length}<p class="list-message">{emptyMessage}</p>
{:else}<ul class="form-list" aria-label="Registration forms">{#each forms as form (form.id)}
  {@const count = activeFormQuestionCount(form)}
  {@const date = formDateLabel(form)}
  {@const status = formStatusLabel(form)}
  <li><button type="button" on:click={() => dispatch('select', form)}>
    <div class="form-title"><strong>{form.title || form.name || 'Form name unavailable'}</strong><span class:open={status === 'Open'} class="form-status">{status}</span></div>
    <div class="form-meta">{#if count !== null}<span>{count} {count === 1 ? 'question' : 'questions'}</span>{/if}{#if date}<span>{date}</span>{/if}</div>
    <span class="form-open">Open form <span aria-hidden="true">→</span></span>
  </button></li>
{/each}</ul>{/if}
<style>
.form-list{display:grid;gap:12px;list-style:none;margin:0;padding:0}.form-list button{display:block;width:100%;text-align:left;border:1px solid #dce3ed;border-radius:16px;overflow:hidden;background:var(--crm-surface,#fff);color:var(--crm-text,#182235);font:inherit}.form-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;background:color-mix(in srgb,var(--crm-brand-secondary,#C6A95B) 12%,var(--crm-surface,#fff));border-bottom:1px solid #e2e8f0}.form-title strong{font-size:16px;font-weight:600;overflow-wrap:anywhere;min-width:0}.form-status{flex-shrink:0;font-size:12px;padding:3px 8px;border-radius:6px;background:#f1f5f9;color:#526176}.form-status.open{background:var(--crm-brand-surface,#F8F5EC);color:var(--crm-brand-link,#003366)}.form-meta{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:14px;line-height:1.5;color:var(--crm-text-muted,#64748b);padding:12px 16px 0}.form-meta:empty{display:none}.form-open{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:8px 16px;font-size:14px;color:var(--crm-brand-link,#0b2d50)}.form-list button:hover{border-color:var(--crm-brand-border,#806D3B);box-shadow:0 2px 8px color-mix(in srgb,var(--crm-brand-primary,#003366) 10%,transparent)}.list-message{padding:20px 0;font-size:14px;color:var(--crm-text-muted,#64748b)}
</style>
