import { describe, expect, it } from 'vitest';

import {
  clearCrmContext,
  readCrmContext,
  resolveAuthorizedPage,
  resolveAuthorizedTenant,
  writeCrmContext,
} from '../../src/lib/crm/crmContextPersistence';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('CRM context persistence', () => {
  it('stores tenant and page per administrator identity', () => {
    const storage = new MemoryStorage();
    writeCrmContext('admin-a', {
      tenantId: 'release-club',
      page: 'Financials',
    }, storage);

    expect(readCrmContext('admin-a', storage)).toEqual({
      tenantId: 'release-club',
      page: 'Financials',
    });
    expect(readCrmContext('admin-b', storage)).toBeNull();

    clearCrmContext('admin-a', storage);
    expect(readCrmContext('admin-a', storage)).toBeNull();
  });

  it('rejects malformed stored context and falls back for unknown pages', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'huddleway.crm.context.v1:admin-a',
      '{malformed',
    );

    expect(readCrmContext('admin-a', storage)).toBeNull();
    expect(storage.values.size).toBe(0);

    const unknown = {
      tenantId: 'release-club',
      page: 'Unknown internal route',
    };
    expect(resolveAuthorizedPage(
      unknown,
      'release-club',
      ['Dashboard', 'Financials'],
    )).toBe('Dashboard');
  });

  it('restores only an authorized tenant and role-visible page', () => {
    const stored = { tenantId: 'release-club', page: 'Financials' };
    expect(resolveAuthorizedTenant(
      ['eagle', 'release-club'],
      null,
      stored,
    )).toBe('release-club');
    expect(resolveAuthorizedTenant(
      ['eagle'],
      null,
      stored,
    )).toBe('eagle');
    expect(resolveAuthorizedPage(
      stored,
      'release-club',
      ['Dashboard', 'Financials'],
    )).toBe('Financials');
    expect(resolveAuthorizedPage(
      stored,
      'release-club',
      ['Dashboard'],
    )).toBe('Dashboard');
    expect(resolveAuthorizedPage(
      stored,
      'eagle',
      ['Dashboard', 'Financials'],
    )).toBe('Dashboard');
  });
});
