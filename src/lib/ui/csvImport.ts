export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

/** Parse a small, standards-compatible CSV file without executing any cell content. */
export function parseCsv(text: string): ParsedCsv {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false;

  const pushCell = () => {
    record.push(cell.trim());
    cell = '';
    cellStarted = false;
  };
  const pushRecord = () => {
    pushCell();
    if (record.some((value) => value !== '')) records.push(record);
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
      }
      continue;
    }
    if (character === '"') {
      if (cellStarted || cell !== '') {
        throw new Error('CSV contains an invalid quote. Put quoted values in double quotes.');
      }
      inQuotes = true;
      cellStarted = true;
    } else if (character === ',') {
      pushCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRecord();
    } else {
      cell += character;
      cellStarted = true;
    }
  }
  if (inQuotes) throw new Error('CSV contains an unfinished quoted value.');
  if (cell !== '' || record.length > 0) pushRecord();
  if (records.length === 0) throw new Error('CSV file is empty.');

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('Every CSV column needs a header.');
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('CSV headers must be unique.');
  }
  return { headers, rows: records.slice(1) };
}

export function normalizeCsvHeader(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
