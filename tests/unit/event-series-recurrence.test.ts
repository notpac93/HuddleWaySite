import { describe, it, expect } from 'vitest';
import { recurringEventDates } from '../../src/lib/ui/eventRecurrence';
import { groupEventSeries } from '../../src/lib/ui/eventSeries';
describe('recurring event presentation', () => {
  it('anchors weekly and alternate-week dates to the chosen start across DST', () => {
    expect(recurringEventDates('2026-03-01', '2026-03-15', [0], true)).toEqual(['2026-03-01', '2026-03-15']);
    expect(recurringEventDates('2026-03-08', '2026-03-15', [0])).toEqual(['2026-03-08', '2026-03-15']);
    expect(recurringEventDates('2026-03-16', '2026-03-15', [0])).toEqual([]);
  });
  it('preserves every scheduled session while listing one event', () => {
    const all = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, eventSeriesId: 'series', lifecycleStatus: 'draft' }));
    const grouped = groupEventSeries(all);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].occurrences).toHaveLength(9);
    expect(grouped[0].hasDrafts).toBe(true);
    expect(groupEventSeries(all.slice(4), all)[0].occurrences).toHaveLength(9);
  });
  it('keeps unrelated events separate and exposes mixed series status', () => {
    const all = [{ id: 'a', eventSeriesId: 's', lifecycleStatus: 'published' }, { id: 'b', eventSeriesId: 's', lifecycleStatus: 'draft' }, { id: 'c', lifecycleStatus: 'draft' }];
    expect(groupEventSeries(all).map((event) => event.lifecycleStatus)).toEqual(['mixed', 'draft']);
  });
});
