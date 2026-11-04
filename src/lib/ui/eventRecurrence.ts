export type ScheduleCadence = 'daily' | 'weekly' | 'bi-weekly' | 'monthly';

/** Bounded calendar arithmetic; daylight-saving changes cannot add or drop a date. */
export function scheduledEventDates(start: string, end: string, days: number[], pattern: ScheduleCadence = 'weekly'): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return [];
  const first = new Date(`${start}T12:00:00Z`), last = new Date(`${end}T12:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || first.toISOString().slice(0, 10) !== start || last.toISOString().slice(0, 10) !== end) return [];
  if (!['daily', 'weekly', 'bi-weekly', 'monthly'].includes(pattern)) return [];
  if (['weekly', 'bi-weekly'].includes(pattern) && !days.some(day => Number.isInteger(day) && day >= 0 && day < 7)) return [];
  const anchor = first.getTime() - first.getUTCDay() * 86400000;
  const result: string[] = [];
  if (pattern === 'monthly') {
    for (let offset = 0; ; offset++) {
      const month = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1, 12));
      if (month > last) break;
      const date = new Date(month); date.setUTCDate(first.getUTCDate());
      // A monthly 31st skips months without that day; it never rolls into another month.
      if (date.getUTCMonth() === month.getUTCMonth() && date <= last) result.push(date.toISOString().slice(0, 10));
      if (result.length > 200) break;
    }
    return result;
  }
  for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const week = Math.floor((cursor.getTime() - anchor) / 604800000);
    if (pattern === 'daily' || (days.includes(cursor.getUTCDay()) && (pattern !== 'bi-weekly' || week % 2 === 0))) result.push(cursor.toISOString().slice(0, 10));
    if (result.length > 200) break;
  }
  return result;
}

export function recurringEventDates(start: string, end: string, days: number[], everyOtherWeek = false): string[] {
  return scheduledEventDates(start, end, days, everyOtherWeek ? 'bi-weekly' : 'weekly');
}
