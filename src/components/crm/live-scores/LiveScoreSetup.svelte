<script lang="ts">
  import { modalFocus } from '../../../lib/ui/modalFocus';
  import type { LiveScoreBoard, ScoreEvent } from '../../../lib/api/LiveScoresApi';
  export let board: LiveScoreBoard | null = null;
  export let event: ScoreEvent | null = null;
  export let events: ScoreEvent[] = [];
  export let busy = false;
  export let error = '';
  export let onClose: () => void;
  export let onSave: (values: Record<string, unknown>) => void;
  function workspaceOverlay(node: HTMLElement) {
    // Escape the main pane's stacking context while retaining tenant tokens.
    const host = node.closest('.crm-ui-shell-root') || document.body;
    host.appendChild(node);
    return { destroy: () => node.remove() };
  }
  let title = board?.title || event?.title || '';
  let names = board?.names.slice() || ['', ''];
  let scores = board?.scores.slice() || [0, 0];
  let display = board?.display || 'duel';
  let eventId = board?.eventId || event?.id || '';
  $: locked = Boolean(board?.started || board?.status === 'live' || board?.status === 'final');
  $: isFinal = board?.status === 'final';
  function count(value: number) {
    names = Array.from({ length: value }, (_, i) => names[i] || '');
    if (value !== 2) display = 'bars';
  }
  function submit() {
    onSave({ title: title.trim(), names: names.map(n => n.trim()), display,
      eventId: eventId || null,
      ...(isFinal ? { scores } : {}),
      ...(board ? { action: 'edit', revision: board.revision } : {}) });
  }
</script>
<div class="score-modal-backdrop" use:workspaceOverlay>
  <div class="score-modal" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="score-setup-title" use:modalFocus={{ onEscape: () => { if (!busy) onClose(); }, initialFocusSelector: 'input' }}>
    <form on:submit|preventDefault={submit}>
      <header><h2 id="score-setup-title">{isFinal ? 'Final score' : board ? 'Game details' : 'New game'}</h2><button type="button" class="score-icon" aria-label="Close game setup" disabled={busy} on:click={onClose}>×</button></header>
      <label>Game<input required maxlength="80" bind:value={title} placeholder="Game name" /></label>
      {#if !locked}
        <div class="score-setup-grid">
          <label>Participants<select aria-label="Participants" value={names.length} on:change={e => count(Number(e.currentTarget.value))}>{#each Array.from({ length: 7 }, (_, i) => i + 2) as n}<option value={n}>{n}</option>{/each}</select></label>
          <label>Event<select bind:value={eventId}><option value="">Standalone</option>{#each events as item (item.id)}<option value={item.id}>{item.title}</option>{/each}{#if event && !events.some(e => e.id === event?.id)}<option value={event.id}>{event.title}</option>{/if}</select></label>
        </div>
      {/if}
      <div class="score-name-grid">{#each names as name, i}<label>Team {i + 1}<input aria-label={`Team ${i + 1}`} required maxlength="40" bind:value={names[i]} placeholder={`Team ${i + 1}`} /></label>{#if isFinal}<label>Score<input aria-label={`Final score for team ${i + 1}`} type="number" inputmode="numeric" min="0" max="999999" step="1" required bind:value={scores[i]} /></label>{/if}{/each}</div>
      {#if !locked}<fieldset><legend>Display</legend><div class="score-display-options"><button type="button" aria-pressed={display === 'duel'} disabled={names.length !== 2} on:click={() => display = 'duel'}><span aria-hidden="true">▯ ▯</span>1v1</button><button type="button" aria-pressed={display === 'bars'} on:click={() => display = 'bars'}><span aria-hidden="true">▂ ▆ ▃</span>Bars</button></div></fieldset>{/if}
      {#if error}<p role="alert" class="score-error">{error}</p>{/if}
      <footer><button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={onClose}>Cancel</button><button class="crm-ui-button-primary" disabled={busy}>{busy ? 'Saving…' : isFinal ? 'Save final' : board ? 'Save' : 'Create game'}</button></footer>
    </form>
  </div>
</div>
