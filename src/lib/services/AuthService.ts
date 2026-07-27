import { db } from '../firebase';
import { type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export type TenantRole = 'owner' | 'editor' | 'viewer' | 'platform_admin';

export interface TenantAccess {
  tenantId: string;
  role: TenantRole;
}

function normalizedRole(value: unknown): TenantRole | null {
  const candidate =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'role' in value
        ? (value as { role?: unknown }).role
        : null;
  const role = String(candidate ?? '').trim().toLowerCase();
  return ['owner', 'editor', 'viewer'].includes(role)
    ? (role as TenantRole)
    : null;
}

function isActiveMembership(value: unknown) {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as { active?: unknown }).active === true,
  );
}

function rolePriority(role: TenantRole) {
  return {
    viewer: 1,
    editor: 2,
    owner: 3,
    platform_admin: 4,
  }[role];
}

export function parseTenantAccess(
  data: Record<string, unknown>,
  isPlatformAdmin = false,
): TenantAccess[] {
  const access = new Map<string, TenantRole>();
  const add = (tenantIdValue: unknown, role: TenantRole | null) => {
    const tenantId = String(tenantIdValue ?? '').trim();
    if (!tenantId || !role) return;
    const effectiveRole = isPlatformAdmin ? 'platform_admin' : role;
    const current = access.get(tenantId);
    if (!current || rolePriority(effectiveRole) > rolePriority(current)) {
      access.set(tenantId, effectiveRole);
    }
  };

  const tenantRoles =
    data.tenantRoles && typeof data.tenantRoles === 'object'
      ? (data.tenantRoles as Record<string, unknown>)
      : {};
  for (const [tenantId, value] of Object.entries(tenantRoles)) {
    add(tenantId, normalizedRole(value));
  }

  const memberships =
    data.memberships && typeof data.memberships === 'object'
      ? (data.memberships as Record<string, unknown>)
      : {};
  for (const [tenantId, value] of Object.entries(memberships)) {
    if (isActiveMembership(value)) add(tenantId, normalizedRole(value));
  }

  add(data.tenantId, normalizedRole(data.role));

  if (isPlatformAdmin) {
    const tenantIds = Array.isArray(data.tenantIds) ? data.tenantIds : [];
    for (const tenantId of tenantIds) add(tenantId, 'platform_admin');
    add(data.tenantId, 'platform_admin');
  }

  return Array.from(access, ([tenantId, role]) => ({ tenantId, role })).sort(
    (left, right) => left.tenantId.localeCompare(right.tenantId),
  );
}

export class AuthService {
  static async fetchUserAccess(user: User): Promise<TenantAccess[]> {
    const [userDocSnap, tokenResult] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      user.getIdTokenResult(),
    ]);
    if (!userDocSnap.exists()) return [];
    const claims = tokenResult.claims;
    const systemRole = String(claims.role ?? '').trim().toLowerCase();
    const isPlatformAdmin =
      claims.platformAdmin === true
      || claims.platform_admin === true
      || claims.super_admin === true
      || ['platform_admin', 'super_admin'].includes(systemRole);
    return parseTenantAccess(userDocSnap.data(), isPlatformAdmin);
  }

  static async fetchUserTenants(user: User): Promise<string[]> {
    return (await this.fetchUserAccess(user)).map((entry) => entry.tenantId);
  }
}
