import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  rosterPlayersPage: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: { rosterPlayersPage: api.rosterPlayersPage },
}));

import { RosterService } from '../../src/lib/services/RosterService';

describe('RosterService visibility-aware refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.rosterPlayersPage.mockReset();
    api.rosterPlayersPage.mockResolvedValue({
      tenantId: 'tenant-a',
      teamId: 'team-a',
      players: [],
      truncated: { registrations: false, memberships: false, teams: false },
      requestId: 'roster-request',
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('refreshes while visible, pauses while hidden, resumes once, and cleans up', async () => {
    const callback = vi.fn();
    const unsubscribe = RosterService.subscribeToPlayers(
      'tenant-a',
      { id: 'team-a' },
      callback,
    );
    vi.runAllTicks();
    await Promise.resolve();
    expect(api.rosterPlayersPage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.rosterPlayersPage).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.rosterPlayersPage).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.runAllTicks();
    await Promise.resolve();
    expect(api.rosterPlayersPage).toHaveBeenCalledTimes(3);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.runAllTicks();
    await Promise.resolve();
    expect(api.rosterPlayersPage).toHaveBeenCalledTimes(3);
  });
});
