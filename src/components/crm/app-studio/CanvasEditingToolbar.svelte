<script lang="ts">
  import type { CrmComponentStudioPage } from '../../../lib/api/BackendApi';
  export let pages: CrmComponentStudioPage[];
  export let pageId: string;
  export let busy: boolean;
  export let dirty: boolean;
  export let canUndo: boolean;
  export let canRedo: boolean;
  export let canPublish: boolean;
  export let message = '';
  export let retryable = false;
  export let onRetry: () => void = () => {};
  export let onPage: (id: string) => void;
  export let onUndo: () => void;
  export let onRedo: () => void;
  export let onReview: () => void;
  export let onDone: () => void;
  export let onSettings: () => void = () => {};
  export let onDiscard: () => void;
  export let onHistory: () => void;
  export let canManage = true;
</script>

<div class="canvas-toolbar" aria-label="App edit mode">
  <div class="toolbar-row">
    <label><span class="sr-only">Page</span><select aria-label="Page" disabled={busy} value={pageId} on:change={(event) => onPage(event.currentTarget.value)}>{#each pages as page}<option value={page.id}>{page.title}</option>{/each}</select></label>
    <button type="button" aria-label="Undo" title="Undo" disabled={!canUndo || busy} on:click={onUndo}>↶</button>
    <details><summary aria-label="More editing actions">⋯</summary><div class="more-actions">
      <button type="button" disabled={busy} on:click={onSettings}>Appearance &amp; navigation</button>
      <button type="button" disabled={!canRedo || busy} on:click={onRedo}>Redo</button>
      <button type="button" disabled={!canManage || busy} on:click={onHistory}>Version history</button>
      <button type="button" disabled={!dirty || !canManage || busy} on:click={onDiscard}>Discard unpublished changes</button>
    </div></details>
    {#if retryable}<button type="button" on:click={onRetry}>Retry</button>{:else}<button type="button" class="review" disabled={!canPublish} on:click={onReview}>Review</button>{/if}
    <button type="button" disabled={busy} on:click={onDone}>Done</button>
  </div>
  <p role="status">{message || (dirty ? 'Unpublished changes · Select an outlined area to edit' : 'Edit mode · Select outlined text or a section')}</p>
</div>

<style>
  .canvas-toolbar { width: 100%; padding: 6px 8px; background: #fff; border: 1px solid #dce2eb; border-radius: 14px; box-shadow: 0 3px 16px #0001; font: 12px/1.3 system-ui; }
  .toolbar-row { display: flex; align-items: center; gap: 4px; }
  button, select { min-height: 40px; border-radius: 9px; border: 1px solid #dce2eb; background: white; padding: 6px 10px; color: #182235; }
  select { width: 100%; max-width: 130px; }
  label { min-width: 0; flex: 1; }
  details { position: relative; }
  summary { cursor: pointer; list-style: none; min-height: 40px; padding: 6px 10px; border: 1px solid #dce2eb; border-radius: 9px; font-size: 20px; line-height: 24px; }
  .more-actions { position: absolute; right: 0; top: 44px; width: 210px; padding: 6px; border: 1px solid #dce2eb; border-radius: 10px; background: white; box-shadow: 0 3px 16px #0002; }
  .more-actions button { display: block; width: 100%; text-align: left; border: 0; }
  button:disabled { opacity: .45; }
  .review { background: #155eef; color: white; border-color: #155eef; }
  p { margin: 4px 2px 0; color: #52657b; font-size: 11px; }
</style>
