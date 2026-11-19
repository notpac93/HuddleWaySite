<script lang="ts">
  import { tick } from 'svelte';
  export let id: string;
  export let label: string;
  export let value: string;
  export let kind: 'text' | 'calendar' | 'ticket' | 'layers' = 'text';
  let editing = false;
  let editButton: HTMLButtonElement;
  let editor: HTMLDivElement;
  async function toggleEditor() {
    editing = !editing;
    await tick();
    if (editing) editor.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus();
    else editButton.focus();
  }
</script>

<div class="event-detail">
  <div class="detail-row">
    <svg class="detail-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
      {#if kind === 'calendar'}<path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      {:else if kind === 'layers'}<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />
      {:else if kind === 'ticket'}<path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Zm12 0v3m0 2v3m0 2v2" />
      {:else}<path d="M4 5h16M12 5v15m-5 0h10" />{/if}
    </svg>
    <div class="detail-copy"><span>{label}</span><strong>{value || 'Not set'}</strong></div>
    <button bind:this={editButton} type="button" class="detail-edit" aria-label={`Edit ${label.toLowerCase()}`} aria-expanded={editing} aria-controls={id} on:click={toggleEditor}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1 1-5Z" /></svg>Edit
    </button>
  </div>
  <div bind:this={editor} id={id} class="detail-editor" hidden={!editing}>
    <slot />
    <div class="detail-done"><button type="button" class="crm-ui-event-action-primary" on:click={toggleEditor}>Done<span class="sr-only"> editing {label.toLowerCase()}</span></button></div>
  </div>
</div>

<style>
  .event-detail{border-top:1px solid #dce3ec}
  .detail-row{display:flex;align-items:center;gap:11px;padding:12px 15px;min-height:68px}
  .detail-icon{flex-shrink:0;color:var(--crm-text-muted,#607087)}
  .detail-copy{flex:1;min-width:0}.detail-copy span{display:block;font-size:12px;color:var(--crm-text-muted,#607087)}.detail-copy strong{display:block;font-size:14px;font-weight:500;white-space:pre-line;overflow-wrap:anywhere}
  .detail-edit{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 4px;color:var(--crm-brand-link);font-size:13px;flex-shrink:0}
  .detail-editor{padding:15px;background:#edf3f9;border-top:1px solid #dce3ec}.detail-editor[hidden]{display:none}.detail-done{display:flex;justify-content:flex-end;margin-top:12px}
  .detail-edit:focus-visible{outline:2px solid var(--crm-brand-focus);outline-offset:3px;border-radius:4px}
</style>
