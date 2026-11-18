<script lang="ts">
  import type { LiveScoreBoard } from '../../../lib/api/LiveScoresApi';
  export let board: LiveScoreBoard;
  export let busy = false;
  export let canEdit = true;
  export let undoAvailable = false;
  export let onScore: (participant: number, delta: number) => void;
  export let onAction: (action: 'start' | 'finish' | 'undo') => void;
  export let onEdit: () => void;
  let selected = 0;
  let confirmingFinish = false;
  $: if (selected >= board.names.length) selected = 0;
  $: live = board.status === 'live';
</script>
<article class="score-control" aria-label={board.title}>
  <header><div><span class:score-is-live={live} class="score-status">{live ? '● Live' : board.status === 'draft' ? 'Ready' : 'Final'}</span><h2>{board.title}</h2></div><button class="score-icon" type="button" aria-label={`Edit ${board.title}`} disabled={busy || !canEdit} on:click={onEdit}>✎</button></header>
  <div class="score-teams" role="group" aria-label="Scoring team">
    {#each board.names as name, i}
      <button type="button" class:selected={selected === i} aria-pressed={selected === i} aria-label={`Select ${name}`} disabled={busy || !canEdit || board.status === 'final'} on:click={() => selected = i}>
        <span class="score-badge" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><span class="score-team-name">{name}</span><strong>{board.scores[i]}</strong>
      </button>
    {/each}
  </div>
  {#if canEdit}
    {#if live}
      <div class="score-additions" role="group" aria-label={`Add points to ${board.names[selected]}`}>
        <button type="button" class="score-minus" aria-label="Subtract 1 point" disabled={busy || board.scores[selected] === 0} on:click={() => onScore(selected, -1)}>−</button>
        <button type="button" class="score-plus-one" aria-label="Add 1 point" disabled={busy} on:click={() => onScore(selected, 1)}>+1</button>
        <button type="button" class="score-plus-two" aria-label="Add 2 points" disabled={busy} on:click={() => onScore(selected, 2)}>+2</button>
        <button type="button" class="score-plus-three" aria-label="Add 3 points" disabled={busy} on:click={() => onScore(selected, 3)}>+3</button>
      </div>
      <footer><button type="button" class="score-text-button" disabled={busy || !undoAvailable} on:click={() => onAction('undo')}>↶ Undo</button><button type="button" class="score-text-button" disabled={busy} on:click={() => confirmingFinish = !confirmingFinish}>Finish</button></footer>
      {#if confirmingFinish}<div class="score-finish"><strong>End game?</strong><button type="button" class="crm-ui-button-secondary" disabled={busy} on:click={() => confirmingFinish = false}>Keep live</button><button type="button" class="crm-ui-button-primary" disabled={busy} on:click={() => onAction('finish')}>End game</button></div>{/if}
    {:else if board.status === 'draft'}
      <button type="button" class="crm-ui-button-primary score-start" disabled={busy} on:click={() => onAction('start')}>● Start live</button>
    {/if}
  {/if}
</article>
