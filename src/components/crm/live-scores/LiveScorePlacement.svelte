<script lang="ts">
  import { onMount } from 'svelte';
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import { createIdempotencyKey } from '../../../lib/api/BackendApi';
  import { liveScoresApi, type LiveScoreBoard, type ScorePage } from '../../../lib/api/LiveScoresApi';
  export let tenantId: string;
  export let board: LiveScoreBoard;
  export let start = false;
  export let onClose: () => void;
  export let onDone: () => void;
  let pages: ScorePage[] = [];
  let selected: string[] = [];
  let loading = true;
  let saving = false;
  let error = '';
  let active = true;
  let operationId = '';
  let savedSelection = '';
  function overlay(node: HTMLElement) {
    (node.closest('.crm-ui-shell-root') || document.body).appendChild(node);
    return { destroy: () => node.remove() };
  }
  async function load() {
    loading = true; error = '';
    try {
      const result = await liveScoresApi.placement(tenantId, board.id);
      if (!active) return;
      pages = result;
      selected = pages.filter(page => page.placed || page.recommended).map(page => page.id);
    } catch (e) { if (active) error = e instanceof Error ? e.message : 'Pages could not be loaded.'; }
    finally { if (active) loading = false; }
  }
  async function save() {
    if (!selected.length || saving) return;
    saving = true; error = '';
    const key = [...selected].sort().join(',');
    if (!operationId || key !== savedSelection) {
      operationId = createIdempotencyKey('score-placement').replace(/[^\w-]/g, '-');
      savedSelection = key;
    }
    try {
      await liveScoresApi.place(tenantId, board.id, selected, operationId);
      if (active) onDone();
    } catch (e) { if (active) error = e instanceof Error ? e.message : 'Could not publish scores.'; }
    finally { if (active) saving = false; }
  }
  onMount(() => { void load(); return () => { active = false; }; });
</script>
<div class="score-modal-backdrop" use:overlay>
  <div class="score-modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="score-placement-title" use:modalFocus={{ onEscape: () => { if (!saving) onClose(); } }}>
    <form on:submit|preventDefault={save}>
      <header><h2 id="score-placement-title">Show on</h2><button type="button" class="score-icon" aria-label="Close page picker" disabled={saving} on:click={onClose}>×</button></header>
      <strong>{board.title}</strong>
      {#if loading}<p role="status">Loading pages…</p>
      {:else if pages.length}<fieldset disabled={saving}><legend class="sr-only">Consumer pages</legend>
        {#each pages as page (page.id)}<label class="placement-page"><input type="checkbox" bind:group={selected} value={page.id} disabled={page.placed} /><span>{page.title}</span>{#if page.placed}<span class="placement-published">Published</span>{/if}</label>{/each}
      </fieldset>{:else if !error}<p>No published pages.</p>{/if}
      {#if error}<p role="alert" class="score-error">{error}</p>{#if !pages.length}<button type="button" class="score-text-button" on:click={load}>Retry</button>{/if}{/if}
      <footer><button type="button" class="crm-ui-button-secondary" disabled={saving} on:click={onClose}>Cancel</button><button type="submit" class="crm-ui-button-primary" disabled={loading || saving || !selected.length}>{saving ? 'Publishing…' : start ? 'Publish & start' : 'Publish scores'}</button></footer>
    </form>
  </div>
</div>
<style>
  fieldset { border: 0; padding: 0; margin: 14px 0; max-height: 45vh; overflow-y: auto; }
  .score-modal .placement-page { display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 12px 4px; margin: 0; min-height: 48px; border-bottom: 1px solid var(--crm-border, #dce3ec); }
  .score-modal .placement-page input { width: 20px; height: 20px; min-height: 20px; padding: 0; margin: 0; flex: 0 0 20px; border-radius: 4px; accent-color: var(--crm-brand-primary, #397c69); }
  .placement-page span { flex: 1; }
  .placement-published { flex: 0 !important; font-size: 12px; color: var(--crm-text-muted, #607087); }
</style>
