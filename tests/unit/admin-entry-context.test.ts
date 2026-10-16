import { describe, it, expect } from 'vitest';
import { authorizedEntryProgram, requestedAdminProgram } from '../../src/lib/crm/adminEntryContext';
describe('Admin app entry program context', () => {
  it('honors a requested program only after live membership resolution', () => {
    expect(authorizedEntryProgram(['first', 'new-program'], 'new-program', 'first')).toBe('new-program');
    expect(authorizedEntryProgram(['first'], 'another-program', 'first')).toBe('first');
    expect(authorizedEntryProgram([], 'new-program', null)).toBeNull();
  });
  it('accepts IDs only, never auth data or external destinations', () => {
    expect(requestedAdminProgram({search: '?program=new-program'})).toBe('new-program');
    expect(requestedAdminProgram({search: '?program=https://other.invalid'})).toBeNull();
    expect(requestedAdminProgram(undefined)).toBeNull();
  });
});
