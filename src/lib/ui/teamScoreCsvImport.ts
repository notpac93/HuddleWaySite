import { normalizeCsvHeader } from './csvImport';
import { digest, isCsvSummary, normalizeName, scoreCsvHeaders, teamSlug, type TeamCsvTable } from './teamCsvImport';

export type ScoreEventOption = { id?: string; title?: string };
export type ScoreColumns = Record<'score' | 'event' | 'division' | 'challenge', number | null>;
export type ScoreImportRow = {
  line: number; name: string; score: number; eventName: string; eventId: string | null;
  title: string; division: string | null; teamId?: string; issue: string;
  teamOnly: boolean; usesImportTitle: boolean;
};

const headers = {
  score: scoreCsvHeaders,
  event: ['event', 'eventname', 'eventtitle', 'eventid', 'competition', 'tournament'],
  division: ['division', 'classification', 'category', 'agegroup'],
  challenge: ['challenge', 'challengename', 'game', 'gamename', 'activity', 'scoretitle', 'scoringeventtitle', 'resulttitle'],
};

function readScore(value: string) {
  return /^[+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(value)
    ? Number(value.replaceAll(',', '')) : NaN;
}

export function scoreColumnCandidates(table: TeamCsvTable): number[] {
  const values = table.records[0].values.map(normalizeCsvHeader);
  const exact = values.flatMap((value, index) => headers.score.includes(value) ? [index] : []);
  if (exact.length) return exact;
  const rows = table.records.slice(1);
  return values.flatMap((value, index) =>
    /(?:score|points)$/.test(value) && rows.some(
      ({ values: row }) => Number.isInteger(readScore(normalizeName(row[index]))),
    ) ? [index] : [],
  );
}

export function suggestScoreColumns(table: TeamCsvTable): ScoreColumns {
  const values = table.records[0].values.map(normalizeCsvHeader);
  const find = (aliases: string[]) => {
    const index = values.findIndex(value => aliases.includes(value));
    return index < 0 ? null : index;
  };
  const candidates = scoreColumnCandidates(table);
  return { score: candidates.length === 1 ? candidates[0] : null, event: find(headers.event),
    division: find(headers.division), challenge: find(headers.challenge) };
}

export function suggestImportTitle(header: string | undefined): string {
  if (!header || headers.score.includes(normalizeCsvHeader(header))) return '';
  return normalizeName(header).replace(/\s+(?:score|points)$/i, '').slice(0, 80);
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
  importTitle = 'Imported scores',
) {
  const read = (values: string[], column: number | null) => normalizeName(column === null ? '' : values[column]);
  const seen = new Map<string, number>();
  const newTeamNames = new Map<string, string>();
  return table.records.slice(hasHeader ? 1 : 0).map(({ line, values }): ScoreImportRow => {
    const name = read(values, nameColumn);
    const rawScore = read(values, columns.score);
    const score = readScore(rawScore);
    const teamOnly = rawScore === '';
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
    const rowTitle = read(values, columns.challenge) || event?.title || eventName;
    const title = rowTitle || importTitle;
    const existing = teams.filter(team => team.id && key(team.name || team.title) === key(name));
    const slug = teamSlug(name);
    const teamKey = existing[0]?.id || slug || key(name);
    const groupKey = JSON.stringify(teamOnly ? [teamKey] : [eventId, key(division || ''), key(title), teamKey]);
    const previous = seen.get(groupKey);
    let issue = '';
    if (!name || !/[\p{L}\p{N}]/u.test(name) || name.length > 160) issue = 'Enter a valid team name of up to 160 characters';
    else if (isCsvSummary(name)) issue = 'Summary row ignored';
    else if (!teamOnly && (!Number.isInteger(score) || score < 0 || score > 999999)) issue = 'Enter a whole-number score from 0 to 999999';
    else if (!teamOnly && eventName && !eventId && override !== '') issue = matches.length > 1 ? 'Choose the matching event' : 'Event not found. Choose an event or leave it unlinked';
    else if (!teamOnly && (title.length > 80 || (division?.length || 0) > 80)) issue = 'Challenge and division must be 80 characters or fewer';
    else if (existing.length > 1) issue = 'Multiple program teams have this name';
    else if (teamOnly && existing.length) issue = 'Already exists in this program';
    else if (!existing.length && slug && teams.some(team => team.id === slug)) issue = 'Team name conflicts with an existing team ID';
    else if (!existing.length && newTeamNames.has(teamKey) && newTeamNames.get(teamKey) !== key(name)) issue = 'Team name conflicts with another team in this file';
    else if (previous) issue = teamOnly ? `Conflicts with row ${previous}` : `Duplicate team result for this challenge (row ${previous})`;
    if (!issue) {
      seen.set(groupKey, line);
      if (!existing.length) newTeamNames.set(teamKey, key(name));
    }
    return { line, name: existing[0]?.name || existing[0]?.title || name, score,
      eventName, eventId, title, division, teamId: existing[0]?.id, issue, teamOnly, usesImportTitle: !teamOnly && !rowTitle };
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
