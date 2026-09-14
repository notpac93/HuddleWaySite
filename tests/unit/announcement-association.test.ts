import { describe, expect, it } from 'vitest';
import { normalizeAnnouncementImportance } from '../../src/lib/ui/announcementAssociation';

describe('normalizeAnnouncementImportance', () => {
  it('preserves an explicit supported importance', () => {
    expect(normalizeAnnouncementImportance('featured', 'Practice')).toBe('featured');
  });

  it.each([
    ['Weather cancellation', 'urgent'],
    ['Regional tournament', 'featured'],
    ['Weekly practice', 'routine'],
    ['Team dinner', 'standard'],
  ])('infers %s as %s', (title, expected) => {
    expect(normalizeAnnouncementImportance('', title)).toBe(expected);
  });
});
