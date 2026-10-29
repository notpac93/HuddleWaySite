/** Group dated records for admin presentation; retain every occurrence for individual actions. */
export function groupEventSeries<T extends { id: string; eventSeriesId?: string | null; lifecycleStatus?: string; dateObj?: Date | null }>(visible: T[], all: T[] = visible) {
  const groups = new Map<string, T[]>();
  for (const event of visible) {
    const key = event.eventSeriesId || event.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return [...groups.values()].map((matches) => {
    const first = matches[0];
    const occurrences = first.eventSeriesId ? all.filter((event) => event.eventSeriesId === first.eventSeriesId) : [first];
    occurrences.sort((a, b) => (a.dateObj?.getTime() || 0) - (b.dateObj?.getTime() || 0));
    const statuses = new Set(occurrences.map((event) => event.lifecycleStatus));
    return { ...first, occurrences, lifecycleStatus: statuses.size === 1 ? first.lifecycleStatus : 'mixed', hasDrafts: occurrences.some((event) => event.lifecycleStatus === 'draft') };
  });
}
