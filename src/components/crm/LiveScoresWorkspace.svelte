<script lang="ts">
  import { onMount } from 'svelte';
  import { activeTenantRole, tenantIdStore, userStore } from '../../lib/authStore';
  import { eventsStore } from '../../lib/services/DataStore';
  import { registerLiveRefresh } from '../../lib/crm/liveRefresh';
  import { liveScoresApi, type LiveScoreBoard, type ScoreEvent } from '../../lib/api/LiveScoresApi';
  import LiveScorePlacement from './live-scores/LiveScorePlacement.svelte';
  import LiveScoreSetup from './live-scores/LiveScoreSetup.svelte';
  import LiveScoreControl from './live-scores/LiveScoreControl.svelte';
  import './live-scores/live-scores.css';

  export let launch: { token: number; scope: string; event: ScoreEvent | null } | null = null;
  let boards: LiveScoreBoard[] = [];
  let selected = '';
  let placement: { board: LiveScoreBoard; start: boolean; scope: string } | null = null;
  let all = false;
  let busy = false;
  let loading = false;
  let initialLoadComplete = false;
  let blocked = false;
  let error = '';
  let setup = false;
  let editing: LiveScoreBoard | null = null;
  let linkedEvent: ScoreEvent | null = null;
  let mounted = false;
  let loadedScope = '';
  let generation = 0;
  let sequence = 0;
  let loadingSequence = 0;
  let consumedLaunch = 0;
  let undo: Record<string, { participant: number; delta: number; playerId?: string; revision: number }> = {};
  $: authorized = ['owner', 'editor', 'platform_admin'].includes($activeTenantRole || '');
  $: teamChallenges = $tenantIdStore === 'stem-it-up-sports';
  $: scope = authorized && $userStore?.uid && $tenantIdStore ? `${$userStore.uid}:${$tenantIdStore}` : '';
  $: if (mounted && loadedScope !== scope) bindScope(scope);
  $: eventOptions = $eventsStore.filter(e => e && typeof e.id === 'string' && typeof e.title === 'string').map(e => ({ id: e.id, title: e.title }));
  $: visible = all ? boards : boards.filter(b => b.id === selected);
  $: if (mounted && loadedScope === scope && scope && !loading && !error && launch && launch.scope === scope && launch.token !== consumedLaunch) consumeLaunch(launch);

  function bindScope(next: string) {
    loadedScope = next;
    generation++;
    sequence++;
    boards = []; selected = ''; undo = {}; placement = null; setup = false; linkedEvent = null; editing = null;
    error = ''; busy = false; loading = false; initialLoadComplete = false; blocked = false; loadingSequence = 0;
    if (next) void load();
  }
  async function load() {
    if (!loadedScope || busy || loadingSequence) return;
    const gen = generation, request = ++sequence, tenant = $tenantIdStore;
    loadingSequence = request;
    loading = !initialLoadComplete;
    try {
      const result = await liveScoresApi.list(tenant);
      if (gen !== generation || request !== sequence) return;
      boards = result.sort((a, b) => ({ live: 0, draft: 1, final: 2 })[a.status] - ({ live: 0, draft: 1, final: 2 })[b.status]);
      if (!boards.some(b => b.id === selected)) selected = boards[0]?.id || '';
      blocked = false; error = '';
    } catch (e) {
      if (gen !== generation || request !== sequence) return;
      error = e instanceof Error ? e.message : 'Scores could not be loaded.';
      if ([401, 403].includes(Number((e as { status?: number })?.status))) { boards = []; blocked = true; }
    } finally {
      if (gen === generation && loadingSequence === request) { loading = false; initialLoadComplete = true; loadingSequence = 0; }
    }
  }
  function consumeLaunch(request: NonNullable<typeof launch>) {
    consumedLaunch = request.token;
    const existing = request.event ? boards.find(b => b.eventId === request.event?.id && b.status !== 'final') || boards.find(b => b.eventId === request.event?.id) : null;
    all = false;
    if (existing) selected = existing.id;
    else if (request.event) { linkedEvent = request.event; editing = null; setup = true; }
  }
  function newGame() { editing = null; linkedEvent = null; error = ''; setup = true; }
  function edit(board: LiveScoreBoard) { editing = board; linkedEvent = null; error = ''; setup = true; }
  async function mutate(values: Record<string, unknown>, board?: LiveScoreBoard, score?: { participant: number; delta: number; playerId?: string }) {
    if (!authorized || blocked || busy || !scope) return;
    const gen = generation, tenant = $tenantIdStore;
    busy = true; error = ''; sequence++;
    try {
      const saved = await liveScoresApi.save(tenant, values, board?.id);
      if (gen !== generation) return;
      boards = [saved, ...boards.filter(b => b.id !== saved.id)]; selected = saved.id;
      if (score) undo = { ...undo, [saved.id]: { ...score, revision: saved.revision } };
      else { const next = { ...undo }; delete next[saved.id]; undo = next; }
      setup = false; editing = null; linkedEvent = null;
    } catch (e) {
      if (gen === generation) {
        error = e instanceof Error ? e.message : 'The update could not be saved.';
        if ([401, 403].includes(Number((e as { status?: number })?.status))) { boards = []; blocked = true; setup = false; }
      }
    } finally { if (gen === generation) busy = false; }
  }
  function action(board: LiveScoreBoard, name: 'start' | 'finish' | 'undo') {
    if (name === 'start') { placement = { board, start: true, scope }; return; }
    if (name === 'undo') {
      const last = undo[board.id];
      if (last?.revision === board.revision) void mutate({ action: 'score', participant: last.participant, delta: -last.delta, playerId: last.playerId }, board);
    } else void mutate({ action: name }, board);
  }
  onMount(() => {
    mounted = true;
    const poll = () => { if (!document.hidden && !busy && !setup && !placement && !blocked) void load(); };
    const timer = window.setInterval(poll, 3000);
    const stopRefresh = registerLiveRefresh(load);
    return () => { mounted = false; generation++; window.clearInterval(timer); stopRefresh(); };
  });
</script>

<section class="live-scores-workspace" aria-labelledby="live-scores-title">
  <header class="score-workspace-header"><h2 class="crm-ui-page-title" id="live-scores-title">Live Scores</h2>{#if authorized}<button type="button" class="crm-ui-button-primary" disabled={busy || blocked} on:click={newGame}>+ New {teamChallenges ? 'challenge' : 'game'}</button>{/if}</header>
  {#if !authorized}<div role="status" class="score-empty">Live Scores is unavailable for this account.</div>
  {:else if loading}<div role="status" class="score-empty">Loading scores…</div>
  {:else}
    {#if error && !setup}<div class="score-error" role="alert">{error} <button type="button" class="score-text-button" on:click={() => void load()}>Retry</button></div>{/if}
    {#if boards.length}
      <nav class="score-game-picker" aria-label={teamChallenges ? 'Challenges' : 'Games'}>
        {#each boards as board (board.id)}<button type="button" class:active={selected === board.id && !all} aria-pressed={selected === board.id && !all} on:click={() => { selected = board.id; all = false; }}>{#if board.status === 'live'}<span class="score-live-dot" aria-hidden="true"></span>{/if}{board.title}{board.division ? ` · ${board.division}` : ''}</button>{/each}
        {#if boards.length > 1}<button type="button" class:active={all} aria-pressed={all} on:click={() => all = !all}>All {teamChallenges ? 'challenges' : 'games'}</button>{/if}
      </nav>
      <div class="score-controls-grid">{#each visible as board (board.id)}<LiveScoreControl {board} {busy} {teamChallenges} canEdit={authorized && !blocked} undoAvailable={undo[board.id]?.revision === board.revision} onEdit={() => edit(board)} onPlace={() => placement = { board, start: false, scope }} onScore={(participant, delta, playerId) => void mutate({ action: 'score', participant, delta, playerId }, board, { participant, delta, playerId })} onAction={name => action(board, name)} />{/each}</div>
    {:else if !blocked}<div class="score-empty"><span class="score-empty-icon" aria-hidden="true">0 : 0</span><h3>Start your first {teamChallenges ? 'challenge' : 'game'}</h3><button type="button" class="crm-ui-button-primary" on:click={newGame}>+ New {teamChallenges ? 'challenge' : 'game'}</button></div>{/if}
  {/if}
</section>
{#if setup && authorized}<LiveScoreSetup board={editing} event={linkedEvent} events={eventOptions} {teamChallenges} {busy} {error} onClose={() => { if (!busy) { setup = false; error = ''; } }} onSave={values => void mutate(values, editing || undefined)} />{/if}

{#if placement && authorized}<LiveScorePlacement tenantId={$tenantIdStore} board={placement.board} start={placement.start} onClose={() => placement = null} onDone={() => {
  const request = placement; placement = null;
  if (request?.start && request.scope === scope) void mutate({ action: 'start' }, request.board);
}} />{/if}
