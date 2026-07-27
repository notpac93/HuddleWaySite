export type CsvColumn<T extends Record<string, unknown>> = {
  key: keyof T | string;
  label: string;
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  const formulaSafe = /^[\t\r\n]*[=+\-@]/.test(normalized)
    ? `'${normalized}`
    : normalized;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function buildCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row[column.key as keyof T])).join(','),
  );
  return [header, ...body].join('\r\n');
}

export function safeCsvFilename(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || 'huddleway-export'}.csv`;
}

export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
  filename: string,
): boolean {
  if (rows.length === 0 || columns.length === 0 || typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([buildCsv(rows, columns)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeCsvFilename(filename);
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
