import { backendClient } from '../api/backendClient';

export type RosterProjectionScope = {
  truncated: {
    registrations: boolean;
    privateRegistrations?: boolean;
    memberships: boolean;
    teams: boolean;
  };
  requestId: string;
};

export class RosterService {
  /**
   * Subscribes to players (registrations) for a given tenant/team.
   */
  static subscribeToPlayers(
    tenantId: string,
    activeTeam: any,
    callback: (players: any[], scope: RosterProjectionScope) => void,
    onError: (error: unknown) => void = () => {},
  ) {
    if (!tenantId) {
      return () => {};
    }

    const activeTeamId =
      typeof activeTeam === 'object' && activeTeam
        ? String(activeTeam.id || '')
        : String(activeTeam || '');
    let cancelled = false;
    let requestInFlight = false;
    const load = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const page = await backendClient.rosterPlayersPage(
          tenantId,
          activeTeamId || undefined,
        );
        if (
          page.tenantId !== tenantId
          || String(page.teamId || '') !== activeTeamId
        ) {
          throw new Error('The roster response did not match the selected organization or team.');
        }
        if (!cancelled) {
          callback(page.players, {
            truncated: page.truncated,
            requestId: page.requestId,
          });
        }
      } catch (error) {
        const requestId = String(
          (error as { requestId?: unknown })?.requestId || '',
        ).trim();
        console.error(
          'Roster players request failed.',
          requestId ? { requestId } : {},
        );
        if (!cancelled) onError(error);
      } finally {
        requestInFlight = false;
      }
    };
    void load();
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }

}
