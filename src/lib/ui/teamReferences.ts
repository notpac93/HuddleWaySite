type Team = { id?: unknown; referenceId?: unknown; name?: unknown; title?: unknown };
type Reference = { documentId: string; name: string };
export type TeamReferenceIndex = Map<string, Reference | null>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const unscoped = new Set(['all', 'program', 'general']);

// Read-side joins only. Mutation inputs keep the original team/document ID.
// Duplicate aliases are ambiguous; suppress their label/match instead of
// choosing whichever record arrived last in a paginated projection.
export function buildTeamReferenceIndex(teams: readonly Team[]): TeamReferenceIndex {
  const result: TeamReferenceIndex = new Map();
  for (const team of teams) {
    const documentId = text(team.id);
    if (!documentId) continue;
    const value = { documentId, name: text(team.name) || text(team.title) || 'Team name unavailable' };
    for (const key of new Set([documentId, text(team.referenceId)].filter(Boolean))) {
      if (unscoped.has(key)) continue;
      result.set(key, result.has(key) ? null : value);
    }
  }
  return result;
}

export function teamNameForReference(index: TeamReferenceIndex, reference: unknown): string {
  const key = text(reference);
  if (unscoped.has(key)) return 'Program-wide';
  return index.get(key)?.name || 'Team unavailable';
}

export function teamReferenceMatches(index: TeamReferenceIndex, reference: unknown, selected: unknown): boolean {
  const key = text(reference), filter = text(selected);
  if (!filter) return true;
  if ((index.has(key) && index.get(key) === null) || (index.has(filter) && index.get(filter) === null)) return false;
  if (key === filter) return true;
  const target = index.get(key), choice = index.get(filter);
  return Boolean(target && choice && target.documentId === choice.documentId);
}
