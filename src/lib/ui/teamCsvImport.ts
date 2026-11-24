import { normalizeCsvHeader, parseCsvRecords } from './csvImport';

const nameHeaders = ['teamname', 'teamnames', 'groupname', 'groupnames', 'team', 'teams', 'group', 'groups', 'name'];
type ExistingTeam = { id?: string; name?: string; title?: string };

function normalizeName(value = '') {
  return value.replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function teamSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

export function readTeamCsv(source: string) {
  const contents = source.replace(/^\uFEFF/, '');
  const hint = /^sep=([,;\t])(?:\r\n|\n|\r)/i.exec(contents);
  const text = hint ? contents.slice(hint[0].length) : contents;
  const candidates = (hint ? [hint[1]] : [',', ';', '\t']).map((delimiter) => {
    const parsed = parseCsvRecords(text, { delimiter, looseQuotes: true, firstLine: hint ? 2 : 1 });
    const headers = parsed.records[0]?.values.map(normalizeCsvHeader) || [];
    const matchingHeader = nameHeaders.find((name) => headers.includes(name));
    const suggestedColumn = matchingHeader ? headers.indexOf(matchingHeader) : null;
    const score = (suggestedColumn === null ? 0 : 100)
      + parsed.records.slice(0, 30).filter((row) => row.values.length > 1).length
      + (parsed.splitIncompleteRow ? 1 : 0);
    return { ...parsed, suggestedColumn, score };
  });
  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (best.unfinishedQuoteLine) throw new Error(`A quote opened on row ${best.unfinishedQuoteLine} is missing its closing quote.`);
  if (!best.records.length) throw new Error('The file is empty.');
  const columnCount = best.records.reduce((count, row) => Math.max(count, row.values.length), 0);
  if (columnCount > 200) throw new Error('Keep the name column and up to 199 other columns, then upload the file again.');
  if (best.records.length > 501) throw new Error('Split the file into batches of up to 500 team rows.');
  return { records: best.records, columnCount, suggestedColumn: best.suggestedColumn };
}

export type TeamCsvTable = ReturnType<typeof readTeamCsv>;

export function teamCsvColumnLabel(table: TeamCsvTable, column: number, hasHeader: boolean) {
  const label = `Column ${column + 1}`;
  const example = table.records.slice(0, hasHeader ? 1 : 10)
    .map((row) => normalizeName(row.values[column])).find(Boolean);
  return example ? `${label} • ${example}` : label;
}

export function reviewTeamCsv(table: TeamCsvTable, column: number, hasHeader: boolean, teams: ExistingTeam[]) {
  const existingIds = new Set(teams.map((team) => team.id?.toLowerCase()));
  const existingNames = new Set(teams.map((team) => normalizeName(team.name || team.title).toLowerCase()));
  const seen = new Map<string, number>();
  return table.records.slice(hasHeader ? 1 : 0).map(({ line, values }) => {
    const name = normalizeName(values[column]);
    const normalizedName = name.toLowerCase();
    const slug = teamSlug(name);
    const key = slug || `name:${normalizedName}`;
    let issue = '';
    if (!name) issue = 'Missing name';
    else if (!/[\p{L}\p{N}]/u.test(name)) issue = 'Name needs at least one letter or number';
    else if (name.length > 160) issue = 'Name exceeds 160 characters';
    else if (existingIds.has(slug) || existingNames.has(normalizedName)) issue = 'Already exists in this program';
    else if (seen.has(key)) issue = `Conflicts with row ${seen.get(key)}`;
    if (!issue) seen.set(key, line);
    return { line, name, issue };
  });
}

export type TeamCsvReviewRow = ReturnType<typeof reviewTeamCsv>[number];

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function teamCsvCreationIdentity(name: string) {
  const key = name.toLowerCase();
  const id = teamSlug(name) || `team-${(await digest(key)).slice(0, 16)}`;
  const creationId = `csv-team-${await digest(`${id}\n${key}`)}`;
  const idempotencyKey = `portal-${await digest(`${creationId}\n${name}`)}`;
  return { id, creationId, idempotencyKey };
}
