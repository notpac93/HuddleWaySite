import { describe, expect, it } from 'vitest';
import { buildTeamReferenceIndex, teamNameForReference, teamReferenceMatches } from '../../src/lib/ui/teamReferences';

describe('team references across operational records and event relationships', () => {
  it('joins the semantic reference and database identity without rewriting records', () => {
    const teams = [{ id: 'tenant-a_esports', referenceId: 'esports', name: 'Esports' },
      { id: 'random-team-id', referenceId: 'random-team-id', name: 'Robotics' }];
    const before = structuredClone(teams), index = buildTeamReferenceIndex(teams);
    expect(teamNameForReference(index, 'esports')).toBe('Esports');
    expect(teamNameForReference(index, 'tenant-a_esports')).toBe('Esports');
    expect(teamReferenceMatches(index, 'esports', 'tenant-a_esports')).toBe(true);
    expect(teamReferenceMatches(index, 'tenant-a_esports', 'esports')).toBe(true);
    expect(teamReferenceMatches(index, 'random-team-id', 'tenant-a_esports')).toBe(false);
    expect(teamNameForReference(index, 'random-team-id')).toBe('Robotics');
    expect(teams).toEqual(before);
  });

  it('does not infer missing relationship IDs by stripping a tenant prefix', () => {
    const index = buildTeamReferenceIndex([{ id: 'tenant-a_esports', name: 'Esports' }]);
    expect(teamNameForReference(index, 'esports')).toBe('Team unavailable');
    expect(teamReferenceMatches(index, 'esports', 'tenant-a_esports')).toBe(false);
    expect(teamNameForReference(index, 'tenant-a_esports')).toBe('Esports');
  });

  it.each([false, true])('fails closed on ambiguous aliases regardless of page order (%s)', reverse => {
    const teams = [{ id: 'one', referenceId: 'shared', name: 'One' },
      { id: 'two', referenceId: 'shared', name: 'Two' }];
    const index = buildTeamReferenceIndex(reverse ? teams.reverse() : teams);
    expect(teamNameForReference(index, 'shared')).toBe('Team unavailable');
    expect(teamReferenceMatches(index, 'shared', 'one')).toBe(false);
    expect(teamReferenceMatches(index, 'shared', 'shared')).toBe(false);
    expect(teamReferenceMatches(index, 'one', 'one')).toBe(true);
  });

  it('treats an alias colliding with another document ID as ambiguous', () => {
    const index = buildTeamReferenceIndex([{ id: 'one', referenceId: 'two', name: 'One' }, { id: 'two', name: 'Two' }]);
    expect(teamNameForReference(index, 'two')).toBe('Team unavailable');
    expect(teamReferenceMatches(index, 'one', 'two')).toBe(false);
  });

  it('keeps explicit program-wide scope and missing-name fallback distinct', () => {
    const index = buildTeamReferenceIndex([{ id: 'one', referenceId: 'all', name: 'One' }, { id: 'unnamed' }, { id: {} }]);
    for (const scope of ['all', 'program', 'general']) {
      expect(teamNameForReference(index, scope)).toBe('Program-wide');
      expect(teamReferenceMatches(index, scope, 'one')).toBe(false);
    }
    expect(teamNameForReference(index, 'unnamed')).toBe('Team name unavailable');
    expect(teamNameForReference(index, {})).toBe('Team unavailable');
    expect(teamReferenceMatches(index, 'unloaded', '')).toBe(true);
    expect(teamReferenceMatches(index, 'unloaded', 'unloaded')).toBe(true);
  });
});
