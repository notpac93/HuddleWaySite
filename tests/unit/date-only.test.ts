import { describe, expect, it } from 'vitest';
import { dateOnlyKey, formatDateOnly } from '../../src/lib/ui/dateOnly';

describe('date-only UI formatting', () => {
  it('keeps UTC-backed calendar dates on the authored day', () => {
    const timestamp = {
      toDate: () => new Date('2026-08-01T00:00:00.000Z'),
    };

    expect(dateOnlyKey(timestamp)).toBe('2026-08-01');
    expect(formatDateOnly(timestamp)).toBe('8/1/2026');
  });

  it('preserves date input keys without local-time conversion', () => {
    expect(dateOnlyKey('2026-11-30')).toBe('2026-11-30');
    expect(formatDateOnly('2026-11-30')).toBe('11/30/2026');
  });
});
