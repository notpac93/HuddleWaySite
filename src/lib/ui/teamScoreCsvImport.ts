import { normalizeCsvHeader } from './csvImport';
import { digest, isCsvSummary, normalizeName, scoreCsvHeaders, teamSlug, type TeamCsvTable } from './teamCsvImport';

export type ScoreEventOption = { id?: string; title?: string };
export type ScoreColumns = Record<'score' | 'event' | 'division' | 'challenge', number | null>;
export type ScoreImportRow = {
  line: number; name: string; score: number; eventName: string; eventId: string | null;
  title: string; division: string | null; teamId?: string; issue: string;
};

const headers = {
  score: scoreCsvHeaders,
  event: ['event', 'eventname', 'eventtitle', 'eventid', 'competition', 'tournament'],
  division: ['division', 'classification', 'category', 'agegroup'],
  challenge: ['challenge', 'challengename', 'game', 'gamename', 'activity'],
};

export function suggestScoreColumns(table: TeamCsvTable): ScoreColumns {
  const values = table.records[0].values.map(normalizeCsvHeader);
  const find = (aliases: string[]) => {
    const index = values.findIndex(value => aliases.includes(value));
    return index < 0 ? null : index;
  };
  return { score: find(headers.score), event: find(headers.event),
    division: find(headers.division), challenge: find(headers.challenge) };
}

const key = (value = '') => normalizeName(value).toLowerCase();

export function reviewTeamScores(
  table: TeamCsvTable,
  nameColumn: number,
  hasHeader: boolean,
  columns: ScoreColumns,
  teams: Array<{ id?: string; name?: string; title?: string }>,
  events: ScoreEventOption[],
  eventOverrides: Record<string, string | undefined>,
) {
  const read = (values: string[], column: number | null) => normalizeName(column === null ? '' : values[column]);
  const seen = new Map<string, number>();
  const newTeamNames = new Map<string, string>();
  return table.records.slice(hasHeader ? 1 : 0).map(({ line, values }): ScoreImportRow => {
    const name = read(values, nameColumn);
    const rawScore = read(values, columns.score);
    const score = /^[+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(rawScore)
      ? Number(rawScore.replaceAll(',', '')) : NaN;
    const eventName = read(values, columns.event);
    const matches = events.filter(event => event.id &&
      (key(event.id) === key(eventName) || key(event.title) === key(eventName)));
    const override = eventOverrides[key(eventName)];
    const event = eventName
      ? override !== undefined ? events.find(item => item.id === override)
        : matches.length === 1 ? matches[0] : undefined
      : undefined;
    const eventId = event?.id || null;
    const division = read(values, columns.division) || null;
    const title = read(values, columns.challenge) || event?.title || eventName || 'Imported scores';
    const existing = teams.filter(team => team.id && key(team.name || team.title) === key(name));
    const slug = teamSlug(name);
    const teamKey = existing[0]?.id || slug || key(name);
    const previous = seen.get(JSON.stringify([eventId, key(division || ''), key(title), teamKey]));
    let issue = '';
    if (!name || !/[\p{L}\p{N}]/u.test(name) || name.length > 160) issue = 'Enter a valid team name of up to 160 characters';
    else if (isCsvSummary(name)) issue = 'Summary row ignored';
    else if (!Number.isInteger(score) || score < 0 || score > 999999) issue = 'Enter a whole-number score from 0 to 999999';
    else if (eventName && !eventId && override !== '') issue = matches.length > 1 ? 'Choose the matching event' : 'Event not found. Choose an event or leave it unlinked';
    else if (title.length > 80 || (division?.length || 0) > 80) issue = 'Challenge and division must be 80 characters or fewer';
    else if (existing.length > 1) issue = 'Multiple program teams have this name';
    else if (!existing.length && slug && teams.some(team => team.id === slug)) issue = 'Team name conflicts with an existing team ID';
    else if (!existing.length && newTeamNames.has(teamKey) && newTeamNames.get(teamKey) !== key(name)) issue = 'Team name conflicts with another team in this file';
    else if (previous) issue = `Duplicate team result for this challenge (row ${previous})`;
    if (!issue) {
      seen.set(JSON.stringify([eventId, key(division || ''), key(title), teamKey]), line);
      if (!existing.length) newTeamNames.set(teamKey, key(name));
    }
    return { line, name: existing[0]?.name || existing[0]?.title || name, score,
      eventName, eventId, title, division, teamId: existing[0]?.id, issue };
  });
}

export function groupTeamScores<T extends ScoreImportRow>(rows: T[]) {
  const groups = new Map<string, { title: string; eventId: string | null; division: string | null; rows: T[] }>();
  for (const row of rows) {
    const groupKey = JSON.stringify([row.eventId, key(row.division || ''), key(row.title)]);
    if (!groups.has(groupKey)) groups.set(groupKey, { title: row.title, eventId: row.eventId, division: row.division, rows: [] });
    groups.get(groupKey)!.rows.push(row);
  }
  return [...groups.values()];
}

export function scoreImportIdentity(title: string, eventId: string | null, division: string | null, teamIds: string[]) {
  return digest(JSON.stringify([key(title), eventId, key(division || ''), teamIds]));
}
