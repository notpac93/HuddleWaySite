import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
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
beforeEach(() => { tenant.set('tenant-a'); role.set('owner'); api.list.mockReset().mockResolvedValue([]); api.save.mockReset(); });
describe('Live Scores workspace', () => {
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
    await screen.findByRole('button', { name: 'Add 1 point' });
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
