import { describe, expect, it } from 'vitest';
import { readTeamCsv, reviewTeamCsv, teamCsvCreationIdentity } from '../../src/lib/ui/teamCsvImport';

describe('team CSV review', () => {
  it('recognizes messy name columns and reports physical row numbers', () => {
    const table = readTeamCsv('\uFEFF\r\n Age; Team Name ;\r\n13; "Red; Blue" ;X\r\n14; red;X\r\n15; RED;X\r\n16;;X\r\n17; Falcons;X');

    expect(table.suggestedColumn).toBe(1);
    expect(reviewTeamCsv(table, 1, true, [{ id: 'legacy-123', name: 'Falcons' }])).toEqual([
      { line: 3, name: 'Red; Blue', issue: '' },
      { line: 4, name: 'red', issue: '' },
      { line: 5, name: 'RED', issue: 'Conflicts with row 4' },
      { line: 6, name: '', issue: 'Missing name' },
      { line: 7, name: 'Falcons', issue: 'Already exists in this program' },
    ]);
  });

  it('supports headerless and tab-separated files and reports unfinished quotes', () => {
    const table = readTeamCsv('Blue Bears\nCircuit Cats');
    expect(table.suggestedColumn).toBeNull();
    expect(reviewTeamCsv(table, 0, false, []).map((row) => row.name)).toEqual(['Blue Bears', 'Circuit Cats']);
    expect(readTeamCsv('ID\tTeam\n1\tCircuit Cats').suggestedColumn).toBe(1);
    expect(() => readTeamCsv('Age,Team\n13,"Unfinished')).toThrow('row 2');
  });

  it('produces stable create-only IDs and handles non-Latin names', async () => {
    const title = await teamCsvCreationIdentity('Circuit Cats');
    const repeat = await teamCsvCreationIdentity('Circuit Cats');
    expect(title).toEqual(repeat);
    expect(title.id).toBe('circuit-cats');
    expect(title.creationId).toBe((await teamCsvCreationIdentity('CIRCUIT CATS')).creationId);
    expect((await teamCsvCreationIdentity('機器人')).id).toMatch(/^team-[a-f0-9]{16}$/);
  });
});
