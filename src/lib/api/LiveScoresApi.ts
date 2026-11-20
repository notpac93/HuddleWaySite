import { backendClient } from './backendClient';
import { createIdempotencyKey } from './BackendApi';

export interface LiveScoreBoard {
  id: string;
  tenantId: string;
  title: string;
  names: string[];
  scores: number[];
  status: 'draft' | 'live' | 'final';
  display: 'duel' | 'bars';
  eventId?: string | null;
  revision: number;
  started: boolean;
}
export interface ScorePage { id: string; title: string; route: string; recommended: boolean; placed: boolean }
export interface ScoreEvent { id: string; title: string }
function validBoard(board: LiveScoreBoard, tenantId: string): boolean {
  return Boolean(board && board.tenantId === tenantId && typeof board.id === 'string' && typeof board.title === 'string'
    && ['draft', 'live', 'final'].includes(board.status) && ['duel', 'bars'].includes(board.display)
    && Number.isInteger(board.revision) && board.revision >= 0 && Array.isArray(board.names) && Array.isArray(board.scores)
    && board.names.length >= 2 && board.names.length <= 8 && board.names.length === board.scores.length
    && board.names.every(name => typeof name === 'string') && board.scores.every(score => Number.isInteger(score) && score >= 0));
}
export const liveScoresApi = {
  async placement(tenantId: string, boardId: string) {
    const result = await backendClient.request<{ pages: ScorePage[] }>(`/admin/live-scores/${encodeURIComponent(boardId)}/placement`, { query: { tenantId } });
    if (!Array.isArray(result.pages) || result.pages.some(page => typeof page.id !== 'string' || typeof page.title !== 'string' || typeof page.route !== 'string' || typeof page.placed !== 'boolean' || typeof page.recommended !== 'boolean')) throw new Error('Pages could not be loaded.');
    return result.pages;
  },
  async place(tenantId: string, boardId: string, pageIds: string[], operationId: string) {
    await backendClient.request(`/admin/live-scores/${encodeURIComponent(boardId)}/placement`, {
      method: 'POST', body: { tenantId, pageIds, operationId },
    });
  },
  async list(tenantId: string) {
    const result = await backendClient.request<{ boards: LiveScoreBoard[] }>('/admin/live-scores', { query: { tenantId } });
    if (!Array.isArray(result.boards) || result.boards.some(board => !validBoard(board, tenantId))) throw new Error('Scores could not be loaded.');
    return result.boards;
  },
  async save(tenantId: string, values: Record<string, unknown>, boardId?: string) {
    const result = await backendClient.request<{ board: LiveScoreBoard }>(
      `/admin/live-scores${boardId ? `/${encodeURIComponent(boardId)}` : ''}`,
      { method: 'POST', body: { ...values, tenantId, operationId: createIdempotencyKey('live-score').replace(/[^\w-]/g, '-') } },
    );
    if (!validBoard(result.board, tenantId) || (boardId && result.board.id !== boardId)) throw new Error('Score update could not be verified.');
    return result.board;
  },
};
