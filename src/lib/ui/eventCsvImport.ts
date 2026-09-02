import { normalizeCsvHeader, parseCsv } from './csvImport';

export type EventCsvTeam = { id: string; name: string };
export type EventCsvExistingEvent = {
  id?: string;
  title?: string;
  teamId?: string;
  dateKey?: string;
  startTime?: string;
};
export type EventCsvReviewRow = {
  sourceLine: number;
  title: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  teamId: string;
  teamName: string;
  type: string;
  location: string;
  notes: string;
  errors: string[];
};

function localDateRoundTrip(dateKey: string, time: string) {
  const value = new Date(`${dateKey}T${time}:00`);
  return !Number.isNaN(value.getTime())
    && [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-') === dateKey
    && value.toTimeString().slice(0, 5) === time;
}

export function reviewEventCsv(
  source: string,
  teams: EventCsvTeam[],
  existingEvents: EventCsvExistingEvent[],
) {
  const csv = parseCsv(source);
  const headers = csv.headers.map(normalizeCsvHeader);
  const required = ['title', 'date', 'starttime', 'endtime', 'team'];
  const fileErrors: string[] = [];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) fileErrors.push(`Missing required columns: ${missing.join(', ')}.`);
  if (!csv.rows.length) fileErrors.push('The CSV does not contain any event rows.');
  if (csv.rows.length > 200) fileErrors.push('Import at most 200 events at a time.');
  if (fileErrors.length) return { rows: [] as EventCsvReviewRow[], fileErrors };

  const teamCandidates = new Map<string, EventCsvTeam[]>();
  for (const team of teams) {
    for (const key of [team.id.toLocaleLowerCase(), team.name.trim().toLocaleLowerCase()]) {
      teamCandidates.set(key, [...(teamCandidates.get(key) || []), team]);
    }
  }
  const seen = new Set(existingEvents.map((event) =>
    `${event.teamId || ''}|${event.dateKey || ''}|${event.startTime || ''}`
  ));

  const rows = csv.rows.map((values, index): EventCsvReviewRow => {
    const value = Object.fromEntries(headers.map((header, column) => [header, String(values[column] || '').trim()]));
    const errors: string[] = [];
    const teamMatches = teamCandidates.get(value.team.toLocaleLowerCase()) || [];
    const resolvedTeam = teamMatches.length === 1 ? teamMatches[0] : null;
    if (!value.title) errors.push('Title is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !localDateRoundTrip(value.date, value.starttime || '00:00')) {
      errors.push('Use a valid date in YYYY-MM-DD format.');
    }
    if (!/^\d{2}:\d{2}$/.test(value.starttime) || !localDateRoundTrip(value.date, value.starttime)) errors.push('Use a valid start time in HH:MM format.');
    if (!/^\d{2}:\d{2}$/.test(value.endtime) || !localDateRoundTrip(value.date, value.endtime)) errors.push('Use a valid end time in HH:MM format.');
    if (value.starttime && value.endtime && value.endtime <= value.starttime) errors.push('End time must be later than start time.');
    if (!teamMatches.length) errors.push('Team does not match an ID or name in this organization.');
    if (teamMatches.length > 1) errors.push('Team name is ambiguous; use the team ID.');
    const conflictKey = `${resolvedTeam?.id || ''}|${value.date}|${value.starttime}`;
    if (resolvedTeam && seen.has(conflictKey)) errors.push('Another event already starts for this team at this date and time.');
    if (!errors.length) seen.add(conflictKey);
    return {
      sourceLine: index + 2,
      title: value.title,
      dateKey: value.date,
      startTime: value.starttime,
      endTime: value.endtime,
      teamId: resolvedTeam?.id || '',
      teamName: resolvedTeam?.name || value.team,
      type: value.type || value.eventtype || 'Other',
      location: value.location || '',
      notes: value.notes || '',
      errors,
    };
  });
  return { rows, fileErrors };
}
