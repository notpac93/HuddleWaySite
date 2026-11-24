export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

type CsvRecord = { line: number; values: string[] };

export function parseCsvRecords(
  text: string,
  { delimiter = ',', looseQuotes = false, firstLine = 1 } = {},
) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false;
  let line = firstLine;
  let recordStart = firstLine;

  const pushCell = () => {
    record.push(cell.trim());
    cell = '';
    cellStarted = false;
  };
  const pushRecord = () => {
    pushCell();
    if (record.some((value) => value !== '')) records.push({ line: recordStart, values: record });
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
        if (character === '\n' || (character === '\r' && source[index + 1] !== '\n')) line += 1;
      }
      continue;
    }
    if (character === '"') {
      if (cellStarted && (!looseQuotes || cell.trim() !== '')) {
        if (!looseQuotes) {
          throw new Error('CSV contains an invalid quote. Put quoted values in double quotes.');
        }
        cell += character;
      } else {
        inQuotes = true;
        cellStarted = true;
      }
    } else if (character === delimiter) {
      pushCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRecord();
      line += 1;
      recordStart = line;
    } else {
      cell += character;
      cellStarted = true;
    }
  }
  if (!inQuotes && (cell !== '' || record.length > 0)) pushRecord();
  return { records, unfinishedQuoteLine: inQuotes ? recordStart : null, splitIncompleteRow: inQuotes && record.length > 0 };
}

/** Parse a small, standards-compatible CSV file without executing any cell content. */
export function parseCsv(text: string): ParsedCsv {
  const { records, unfinishedQuoteLine } = parseCsvRecords(text);
  if (unfinishedQuoteLine) throw new Error('CSV contains an unfinished quoted value.');
  if (records.length === 0) throw new Error('CSV file is empty.');

  const headers = records[0].values;
  if (headers.some((header) => !header)) throw new Error('Every CSV column needs a header.');
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('CSV headers must be unique.');
  }
  return { headers, rows: records.slice(1).map(({ values }) => values) };
}

export function normalizeCsvHeader(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
