import { describe, expect, it } from 'vitest';
import { normalizeCsvHeader, parseCsv } from '../../src/lib/ui/csvImport';

describe('CSV registration import parser', () => {
  it('supports quoted commas, escaped quotes, and CRLF files', () => {
    const result = parseCsv(
      'player_name,parent_email,note\r\n"Jordan, Jr.",parent@example.test,"Coach said ""ready"""\r\n',
    );
    expect(result.headers).toEqual(['player_name', 'parent_email', 'note']);
    expect(result.rows).toEqual([['Jordan, Jr.', 'parent@example.test', 'Coach said "ready"']]);
  });

  it('rejects empty, duplicate, and malformed headers', () => {
    expect(() => parseCsv('')).toThrow(/empty/i);
    expect(() => parseCsv('Name,name\nJordan,jordan@example.test')).toThrow(/unique/i);
    expect(() => parseCsv('name,\nJordan,jordan@example.test')).toThrow(/header/i);
  });

  it('normalizes labels for safe field matching', () => {
    expect(normalizeCsvHeader('Parent / Guardian Email')).toBe('parentguardianemail');
  });
});
