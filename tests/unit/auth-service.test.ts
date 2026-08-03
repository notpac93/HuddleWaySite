import { describe, expect, it } from 'vitest';
import {
  parseCanonicalTenantAccess,
  parseTenantAccess,
  resolveTenantOperationsRole,
} from '../../src/lib/services/AuthService';

describe('tenant access parsing', () => {
  it('uses authoritative tenant roles and active memberships only', () => {
    expect(
      parseTenantAccess({
        tenantRoles: {
          alpha: 'editor',
          bravo: { role: 'owner' },
        },
        memberships: {
          charlie: { active: true, role: 'viewer' },
          inactive: { active: false, role: 'owner' },
        },
      }),
    ).toEqual([
      { tenantId: 'alpha', role: 'editor' },
      { tenantId: 'bravo', role: 'owner' },
      { tenantId: 'charlie', role: 'viewer' },
    ]);
  });

  it('does not treat a tenant id without a role as access', () => {
    expect(
      parseTenantAccess({
        tenantId: 'unprovisioned',
        tenantIds: ['legacy-only'],
      }),
    ).toEqual([]);
  });

  it('promotes known tenant ids for a verified platform administrator', () => {
    expect(
      parseTenantAccess(
        {
          tenantId: 'alpha',
          tenantIds: ['bravo'],
        },
        true,
      ),
    ).toEqual([
      { tenantId: 'alpha', role: 'platform_admin' },
      { tenantId: 'bravo', role: 'platform_admin' },
    ]);
  });
});

describe('canonical tenant membership parsing', () => {
  it('returns only active owner/editor/viewer memberships and keeps the highest role', () => {
    const records = [
      { data: () => ({ tenantId: 'tenant-a', role: 'viewer', active: true, status: 'active' }) },
      { data: () => ({ tenantId: 'tenant-a', role: 'owner', active: true, status: 'active' }) },
      { data: () => ({ tenantId: 'tenant-b', role: 'editor', active: false, status: 'active' }) },
      { data: () => ({ tenantId: 'tenant-c', role: 'consumer', active: true, status: 'active' }) },
    ];

    expect(parseCanonicalTenantAccess(records)).toEqual([
      { tenantId: 'tenant-a', role: 'owner' },
    ]);
  });
});

describe('tenant operations access parsing', () => {
  it('recognizes a dedicated operations viewer without tenant access', () => {
    expect(
      resolveTenantOperationsRole({
        platform_operations_viewer: true,
      }),
    ).toBe('platform_operations_viewer');
  });

  it('gives platform administrators the stronger operations role', () => {
    expect(
      resolveTenantOperationsRole(
        { platform_operations_viewer: true },
        { systemRole: 'platform_admin' },
      ),
    ).toBe('platform_admin');
  });

  it('does not grant operations access to a tenant owner', () => {
    expect(resolveTenantOperationsRole({ role: 'owner' })).toBeNull();
  });
});
