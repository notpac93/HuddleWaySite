import { describe, expect, it } from 'vitest';
import { reviewEventCsv } from '../../src/lib/ui/eventCsvImport';

const teams = [
  { id: 'team-1', name: 'Falcons' },
  { id: 'team-2', name: 'Owls' },
];

describe('event CSV review', () => {
  it('resolves unique team names and returns valid rows without mutating data', () => {
    const result = reviewEventCsv(
      'title,date,start_time,end_time,team,type\nPractice,2030-09-12,17:00,19:00,Falcons,Practice\n',
      teams,
      [],
    );
    expect(result.fileErrors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceLine: 2,
        title: 'Practice',
        teamId: 'team-1',
        teamName: 'Falcons',
        errors: [],
      }),
    ]);
  });

  it('reports row-level schedule, team, and conflict errors', () => {
    const result = reviewEventCsv(
      'title,date,start_time,end_time,team\n,2030-02-30,19:00,18:00,Missing\nPractice,2030-09-12,17:00,19:00,team-1\n',
      teams,
      [{ teamId: 'team-1', dateKey: '2030-09-12', startTime: '17:00' }],
    );
    expect(result.rows[0].errors).toEqual(expect.arrayContaining([
      'Title is required.',
      'Use a valid date in YYYY-MM-DD format.',
      'End time must be later than start time.',
      'Team does not match an ID or name in this organization.',
    ]));
    expect(result.rows[1].errors).toContain(
      'Another event already starts for this team at this date and time.',
    );
  });

  it('fails the file review before rows when required columns are missing', () => {
    const result = reviewEventCsv('title,date\nPractice,2030-09-12\n', teams, []);
    expect(result.rows).toEqual([]);
    expect(result.fileErrors[0]).toContain('starttime');
  });
});
