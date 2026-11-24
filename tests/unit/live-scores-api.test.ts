import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: mocks }));
import { liveScoresApi } from '../../src/lib/api/LiveScoresApi';
const board = { id: 'board-1', tenantId: 'tenant-a', title: 'Game', names: ['A', 'B'], scores: [0, 0], status: 'draft', display: 'duel', revision: 0, started: false };
beforeEach(() => mocks.request.mockReset());
describe('live score API boundary', () => {
  it('loads page choices and publishes within the requested tenant and board', async () => {
    const pages = [{ id: 'home', title: 'Home', route: '/', recommended: true, placed: false }];
    mocks.request.mockResolvedValue({ pages });
    expect(await liveScoresApi.placement('tenant-a', 'board-1')).toEqual(pages);
    expect(mocks.request).toHaveBeenLastCalledWith('/admin/live-scores/board-1/placement', { query: { tenantId: 'tenant-a' } });
    await liveScoresApi.place('tenant-a', 'board-1', ['home'], 'operation-1');
    expect(mocks.request).toHaveBeenLastCalledWith('/admin/live-scores/board-1/placement', { method: 'POST', body: { tenantId: 'tenant-a', pageIds: ['home'], operationId: 'operation-1' } });
    mocks.request.mockResolvedValue({ pages: [{ id: 'bad' }] });
    await expect(liveScoresApi.placement('tenant-a', 'board-1')).rejects.toThrow('Pages could not be loaded');
  });
  it('uses a backend-compatible operation ID and binds every mutation to its tenant', async () => {
    mocks.request.mockResolvedValue({ board });
    await liveScoresApi.save('tenant-a', { title: 'Game', names: ['A', 'B'], display: 'duel', tenantId: 'foreign' });
    const [path, options] = mocks.request.mock.calls[0];
    expect(path).toBe('/admin/live-scores');
    expect(options.method).toBe('POST');
    expect(options.body.tenantId).toBe('tenant-a');
    expect(options.body.operationId).toMatch(/^[\w-]{1,150}$/);
  });
  it('rejects foreign and malformed board responses', async () => {
    for (const value of [{ ...board, tenantId: 'tenant-b' }, { ...board, scores: [] }, { ...board, division: 42 }]) {
      mocks.request.mockResolvedValue({ boards: [value] });
      await expect(liveScoresApi.list('tenant-a')).rejects.toThrow('Scores could not be loaded.');
    }
  });
  it('cannot confirm a mutation with the wrong board identity', async () => {
    mocks.request.mockResolvedValue({ board: { ...board, id: 'another-board' } });
    await expect(liveScoresApi.save('tenant-a', { action: 'start' }, board.id)).rejects.toThrow('could not be verified');
  });
});
