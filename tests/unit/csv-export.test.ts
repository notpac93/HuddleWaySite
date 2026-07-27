import { describe, expect, it } from 'vitest';
import { buildCsv, safeCsvFilename } from '../../src/lib/ui/csvExport';

describe('CSV export', () => {
  it('escapes headings and data without formula or delimiter corruption', () => {
    expect(
      buildCsv(
        [{ id: 'reg-1', name: 'Ada "Ace", Jr.' }],
        [
          { key: 'id', label: 'Registration ID' },
          { key: 'name', label: 'Participant' },
        ],
      ),
    ).toBe(
      '"Registration ID","Participant"\r\n"reg-1","Ada ""Ace"", Jr."',
    );
  });

  it('normalizes download filenames', () => {
    expect(safeCsvFilename(' Fall 2026 / Participants ')).toBe(
      'fall-2026-participants.csv',
    );
    expect(safeCsvFilename('***')).toBe('huddleway-export.csv');
  });
});
