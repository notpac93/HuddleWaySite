import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), placement: vi.fn(), place: vi.fn() }));
vi.mock('../../src/lib/api/LiveScoresApi', () => ({ liveScoresApi: api }));
vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a'), activeTenantRole: writable('owner'), userStore: writable({ uid: 'user-a' }) };
});
vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return { eventsStore: writable([{ id: 'event-1', title: 'U14 basketball' }]) };
});
import Workspace from '../../src/components/crm/LiveScoresWorkspace.svelte';
import { tenantIdStore, activeTenantRole } from '../../src/lib/authStore';
import type { Writable } from 'svelte/store';
import type { LiveScoreBoard } from '../../src/lib/api/LiveScoresApi';
const tenant = tenantIdStore as Writable<string>;
const role = activeTenantRole as Writable<string>;
function board(values = {}): LiveScoreBoard {
  return { id: 'game-1', tenantId: 'tenant-a', title: 'U14 basketball', names: ['HuddleWay', 'Westside'], scores: [0, 0], display: 'duel', status: 'draft', revision: 0, started: false, ...values };
}
beforeEach(() => { tenant.set('tenant-a'); role.set('owner'); api.list.mockReset().mockResolvedValue([]); api.save.mockReset(); api.placement.mockReset().mockResolvedValue([{ id: 'home', title: 'Home', route: '/', recommended: true, placed: false }, { id: 'schedule', title: 'Schedule', route: '/schedule', recommended: true, placed: false }, { id: 'team', title: 'Falcons', route: '/team-falcons', recommended: true, placed: false }]); api.place.mockReset().mockResolvedValue({}); });
afterEach(() => vi.restoreAllMocks());
describe('Live Scores workspace', () => {
  it('keeps a game ready when page publication fails and retries before starting', async () => {
    api.list.mockResolvedValue([board()]); api.place.mockRejectedValueOnce(new Error('Publishing failed'));
    api.save.mockResolvedValue(board({ status: 'live', started: true }));
    render(Workspace);
    await fireEvent.click(await screen.findByRole('button', { name: '● Start live' }));
    const publish = await screen.findByRole('button', { name: 'Publish & start' });
    await waitFor(() => expect(publish).not.toBeDisabled()); await fireEvent.click(publish);
    await screen.findByRole('alert'); expect(api.save).not.toHaveBeenCalled();
    const operation = api.place.mock.calls[0][3]; await fireEvent.click(publish);
    await screen.findByRole('button', { name: 'Add 1 point' });
    expect(api.place.mock.calls[1][3]).toBe(operation);
  });
  it('publishes an already-running game without restarting or changing its score', async () => {
    api.list.mockResolvedValue([board({ status: 'live', started: true, scores: [7, 3] })]); render(Workspace);
    await fireEvent.click(await screen.findByRole('button', { name: 'Show in app' }));
    const publish = await screen.findByRole('button', { name: 'Publish scores' });
    await waitFor(() => expect(publish).not.toBeDisabled()); await fireEvent.click(publish);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.save).not.toHaveBeenCalled(); expect(api.place).toHaveBeenCalledTimes(1);
  });

  it('keeps the empty state visible during background polls and receives new games', async () => {
    let poll!: () => void;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const originalInterval = window.setInterval.bind(window);
    vi.spyOn(window, 'setInterval').mockImplementation((handler, delay, ...args) => {
      if (delay === 3000) poll = handler as () => void;
      return originalInterval(handler, delay, ...args) as unknown as ReturnType<typeof setInterval>;
    });
    render(Workspace);
    const emptyState = await screen.findByRole('heading', { name: 'Start your first game' });
    let resolveRefresh!: (value: LiveScoreBoard[]) => void;
    api.list.mockImplementationOnce(() => new Promise(resolve => resolveRefresh = resolve));
    poll(); await tick();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading scores…')).toBeNull();
    expect(emptyState).toBeVisible();
    resolveRefresh([board()]);
    await screen.findByRole('button', { name: '● Start live' });
    expect(screen.queryByRole('heading', { name: 'Start your first game' })).toBeNull();
  });
  it('shows loading again when switching to a different program', async () => {
    render(Workspace);
    await screen.findByRole('heading', { name: 'Start your first game' });
    let resolveNew!: (value: LiveScoreBoard[]) => void;
    api.list.mockImplementationOnce(() => new Promise(resolve => resolveNew = resolve));
    tenant.set('tenant-b');
    await screen.findByText('Loading scores…');
    expect(screen.queryByRole('heading', { name: 'Start your first game' })).toBeNull();
    resolveNew([]);
    await screen.findByRole('heading', { name: 'Start your first game' });
  });
  it('mounts setup above shell navigation and removes it when closed', async () => {
    const shell = document.createElement('div');
    shell.className = 'crm-ui-shell-root';
    const pane = document.createElement('main');
    shell.appendChild(pane); document.body.appendChild(shell);
    const view = render(Workspace, { target: pane });
    await screen.findByRole('heading', { name: 'Start your first game' });
    await fireEvent.click(screen.getAllByRole('button', { name: /New game/ })[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.parentElement).toBe(shell);
    expect(pane.contains(dialog)).toBe(false);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.unmount(); shell.remove();
  });
  it('creates a standalone game, starts it explicitly and scores the selected team', async () => {
    let game = board();
    api.save.mockImplementation(async (_tenant, values) => {
      if (values.action === 'start') game = { ...game, status: 'live', started: true, revision: game.revision + 1 };
      else if (values.action === 'score') { const scores = [...game.scores]; scores[values.participant] += values.delta; game = { ...game, scores, revision: game.revision + 1 }; }
      return game;
    });
    render(Workspace);
    await screen.findByRole('heading', { name: 'Start your first game' });
    await fireEvent.click(screen.getAllByRole('button', { name: /New game/ })[0]);
    const form = within(screen.getByRole('dialog'));
    await fireEvent.input(form.getByLabelText('Game'), { target: { value: 'U14 basketball' } });
    await fireEvent.input(form.getByLabelText('Team 1'), { target: { value: 'HuddleWay' } });
    await fireEvent.input(form.getByLabelText('Team 2'), { target: { value: 'Westside' } });
    await fireEvent.click(form.getByRole('button', { name: 'Create game' }));
    await screen.findByRole('button', { name: '● Start live' });
    expect(api.save).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ eventId: null, display: 'duel', names: ['HuddleWay', 'Westside'] }), undefined);
    expect(api.save.mock.calls.some(c => c[1].action === 'start')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: '● Start live' }));
    const publish = await screen.findByRole('button', { name: 'Publish & start' });
    await waitFor(() => expect(publish).not.toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'Home' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Schedule' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Falcons' })).toBeChecked();
    expect(api.save.mock.calls.some(c => c[1].action === 'start')).toBe(false);
    await fireEvent.click(publish);
    await screen.findByRole('button', { name: 'Add 1 point' });
    expect(api.place).toHaveBeenCalledWith('tenant-a', 'game-1', ['home', 'schedule', 'team'], expect.any(String));
    await fireEvent.click(screen.getByRole('button', { name: 'Select Westside' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add 2 points' }));
    await waitFor(() => expect(api.save).toHaveBeenLastCalledWith('tenant-a', { action: 'score', participant: 1, delta: 2 }, 'game-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Undo/ })).not.toBeDisabled());
    await fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(api.save).toHaveBeenLastCalledWith('tenant-a', { action: 'score', participant: 1, delta: -2 }, 'game-1'));
  });
  it('opens an event-linked setup and switches to Bars for three participants', async () => {
    render(Workspace, { launch: { token: 1, scope: 'user-a:tenant-a', event: { id: 'event-1', title: 'U14 basketball' } } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Game')).toHaveValue('U14 basketball');
    expect(within(dialog).getByLabelText('Event')).toHaveValue('event-1');
    await fireEvent.change(within(dialog).getByLabelText('Participants'), { target: { value: '3' } });
    expect(within(dialog).getByRole('button', { name: /1v1/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /Bars/ })).toHaveAttribute('aria-pressed', 'true');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('creates a STEM team challenge under its selected event and division', async () => {
    tenant.set('stem-it-up-sports');
    api.save.mockResolvedValue(board({ tenantId: 'stem-it-up-sports', title: 'Build a Robot', division: 'Elementary' }));
    render(Workspace, { launch: { token: 1, scope: 'user-a:stem-it-up-sports', event: { id: 'event-1', title: 'BOLT' } } });
    const form = within(await screen.findByRole('dialog'));
    expect(form.getByLabelText('Challenge')).toHaveValue('');
    expect(form.getByLabelText('Event')).toHaveValue('event-1');
    expect(form.queryByRole('button', { name: '+ Player' })).toBeNull();
    await fireEvent.input(form.getByLabelText('Challenge'), { target: { value: 'Build a Robot' } });
    await fireEvent.input(form.getByLabelText('Division'), { target: { value: '  Elementary  ' } });
    await fireEvent.input(form.getByLabelText('Team 1'), { target: { value: 'Circuit Cats' } });
    await fireEvent.input(form.getByLabelText('Team 2'), { target: { value: 'Robots' } });
    await fireEvent.click(form.getByRole('button', { name: 'Create challenge' }));
    await screen.findByRole('button', { name: 'Build a Robot · Elementary' });
    expect(api.save).toHaveBeenCalledWith('stem-it-up-sports', expect.objectContaining({ title: 'Build a Robot', eventId: 'event-1', division: 'Elementary' }), undefined);
    expect(api.save.mock.calls[0][1]).not.toHaveProperty('players');
  });
  it('edits a STEM challenge division without exposing or replacing legacy players', async () => {
    tenant.set('stem-it-up-sports');
    const live = board({ tenantId: 'stem-it-up-sports', title: 'Robotics', division: 'Middle School', eventId: 'event-1',
      status: 'live', started: true, players: [[{ id: 'p1', name: 'Legacy Player', points: 0 }], []] });
    api.list.mockResolvedValue([live]);
    api.save.mockResolvedValue({ ...live, division: 'Elementary' });
    render(Workspace);
    await fireEvent.click(await screen.findByRole('button', { name: 'Select HuddleWay' }));
    expect(screen.queryByRole('button', { name: /Legacy Player/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Robotics · Middle School' }));
    const form = within(screen.getByRole('dialog'));
    expect(form.getByLabelText('Division')).toHaveValue('Middle School');
    expect(form.queryByLabelText('Public player name')).toBeNull();
    await fireEvent.input(form.getByLabelText('Division'), { target: { value: 'Elementary' } });
    await fireEvent.click(form.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Robotics · Elementary' });
    expect(api.save).toHaveBeenCalledWith('stem-it-up-sports', expect.objectContaining({ division: 'Elementary', action: 'edit', eventId: 'event-1' }), 'game-1');
    expect(api.save.mock.calls[0][1]).not.toHaveProperty('players');
  });
  it('reuses a linked game and keeps display settings out of live scoring', async () => {
    api.list.mockResolvedValue([board({ eventId: 'event-1', status: 'live', started: true })]);
    render(Workspace, { launch: { token: 1, scope: 'user-a:tenant-a', event: { id: 'event-1', title: 'U14 basketball' } } });
    await screen.findByRole('button', { name: 'Add 1 point' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Bars/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit U14 basketball' }));
    expect(screen.queryByLabelText('Participants')).toBeNull();
    expect(screen.queryByRole('button', { name: /Bars/ })).toBeNull();
    expect(screen.getByLabelText('Team 1')).toHaveValue('HuddleWay');
  });
  it('opens a linked final result and corrects scores and names without a restart control', async () => {
    const final = board({ eventId: 'event-1', status: 'final', started: true, scores: [4, 3], revision: 3 });
    api.list.mockResolvedValue([final]);
    api.save.mockResolvedValue({ ...final, names: ['HuddleWay U14', 'Westside'], scores: [4, 6], revision: 4 });
    render(Workspace, { launch: { token: 1, scope: 'user-a:tenant-a', event: { id: 'event-1', title: 'U14 basketball' } } });
    await screen.findByRole('button', { name: 'Edit U14 basketball' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start live/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add 1 point' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit U14 basketball' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('heading', { name: 'Final score' })).toBeVisible();
    expect(screen.queryByLabelText('Participants')).toBeNull();
    expect(dialog.getByLabelText('Final score for team 1')).toHaveValue(4);
    await fireEvent.input(dialog.getByLabelText('Team 1'), { target: { value: 'HuddleWay U14' } });
    await fireEvent.input(dialog.getByLabelText('Final score for team 2'), { target: { value: '6' } });
    await fireEvent.click(dialog.getByRole('button', { name: 'Save final' }));
    await waitFor(() => expect(api.save).toHaveBeenLastCalledWith('tenant-a', expect.objectContaining({ action: 'edit', revision: 3, names: ['HuddleWay U14', 'Westside'], scores: [4, 6] }), 'game-1'));
    await screen.findByRole('button', { name: 'Westside, 6 points' });
    expect(screen.queryByRole('button', { name: /Start live/ })).toBeNull();
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it('drops a late response from a previous program', async () => {
    let resolveOld!: (value: LiveScoreBoard[]) => void;
    api.list.mockImplementation((id: string) => id === 'tenant-a' ? new Promise(resolve => resolveOld = resolve) : Promise.resolve([]));
    render(Workspace);
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('tenant-a'));
    tenant.set('tenant-b');
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('tenant-b'));
    resolveOld([board({ title: 'Private old game' })]);
    await screen.findByRole('heading', { name: 'Start your first game' });
    expect(screen.queryByText('Private old game')).toBeNull();
    expect(get(tenant)).toBe('tenant-b');
  });
  it('does not load scoring controls for a viewer', async () => {
    role.set('viewer'); render(Workspace);
    await screen.findByText('Live Scores is unavailable for this account.');
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /New game/ })).toBeNull();
  });
});
