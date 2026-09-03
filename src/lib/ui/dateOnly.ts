export function dateOnlyKey(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
    if (match) return match[1];
  }
  const candidate = value as {
    toDate?: () => Date;
    toMillis?: () => number;
  };
  const date = candidate?.toDate
    ? candidate.toDate()
    : new Date(candidate?.toMillis ? candidate.toMillis() : value as string | number | Date);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function formatDateOnly(value: unknown, fallback = 'TBD'): string {
  const key = dateOnlyKey(value);
  return key
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      }).format(new Date(`${key}T00:00:00.000Z`))
    : fallback;
}
