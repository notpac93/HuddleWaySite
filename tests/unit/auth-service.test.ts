import { describe, expect, it } from 'vitest';
import { parseTenantAccess } from '../../src/lib/services/AuthService';

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
