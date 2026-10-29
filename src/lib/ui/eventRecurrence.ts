// Calendar-day arithmetic stays independent of daylight-saving clock changes.
export function recurringEventDates(start: string, end: string, days: number[], everyOtherWeek = false): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start || !days.some((day) => Number.isInteger(day) && day >= 0 && day < 7)) return [];
  const first = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || first.toISOString().slice(0, 10) !== start || last.toISOString().slice(0, 10) !== end) return [];
  const anchor = first.getTime() - first.getUTCDay() * 86400000;
  const result: string[] = [];
  for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const week = Math.floor((cursor.getTime() - anchor) / 604800000);
    if (days.includes(cursor.getUTCDay()) && (!everyOtherWeek || week % 2 === 0)) result.push(cursor.toISOString().slice(0, 10));
    if (result.length > 200) break;
  }
  return result;
}
