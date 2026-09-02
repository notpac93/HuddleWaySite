import { type User } from 'firebase/auth';
import { backendClient } from '../api/backendClient';

export type TenantRole = 'owner' | 'editor' | 'viewer' | 'platform_admin';

export interface TenantAccess {
  tenantId: string;
  role: TenantRole;
}

export type TenantOperationsRole =
  | 'platform_admin'
  | 'platform_operations_viewer';

export interface CrmAuthorization {
  tenantAccess: TenantAccess[];
  canViewTenantOperations: boolean;
  tenantOperationsRole: TenantOperationsRole | null;
}

function normalizedSystemRole(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveTenantOperationsRole(
  ...sources: Array<Record<string, unknown>>
): TenantOperationsRole | null {
  const values = sources.filter(Boolean);
  const hasBoolean = (snake: string, camel: string) =>
    values.some((source) => source[snake] === true || source[camel] === true);
  const roles = values.flatMap((source) => [
    normalizedSystemRole(source.role),
    normalizedSystemRole(source.systemRole),
    ...(Array.isArray(source.roles)
      ? source.roles.map(normalizedSystemRole)
      : []),
  ]);
  if (
    hasBoolean('platform_admin', 'platformAdmin')
    || hasBoolean('super_admin', 'superAdmin')
    || roles.some((role) => ['platform_admin', 'super_admin'].includes(role))
  ) {
    return 'platform_admin';
  }
  if (
    hasBoolean(
      'platform_operations_viewer',
      'platformOperationsViewer',
    )
    || roles.includes('platform_operations_viewer')
  ) {
    return 'platform_operations_viewer';
  }
  return null;
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

export function parseCanonicalTenantAccess(
  records: Array<{ data: () => Record<string, unknown> }>,
): TenantAccess[] {
  const access = new Map<string, TenantRole>();
  for (const record of records) {
    const data = record.data();
    if (
      data.active !== true
      || String(data.status || '').trim().toLowerCase() !== 'active'
    ) continue;
    const tenantId = String(data.tenantId || '').trim();
    const role = normalizedRole(data.role);
    if (!tenantId || !role) continue;
    const current = access.get(tenantId);
    if (!current || rolePriority(role) > rolePriority(current)) {
      access.set(tenantId, role);
    }
  }
  return Array.from(access, ([tenantId, role]) => ({ tenantId, role })).sort(
    (left, right) => left.tenantId.localeCompare(right.tenantId),
  );
}

export class AuthService {
  static async fetchAuthorization(user: User): Promise<CrmAuthorization> {
    // The user argument preserves the existing store contract; the backend
    // independently verifies the current ID token and resolves live access.
    void user;
    return backendClient.crmAuthorization();
  }

  static async fetchUserAccess(user: User): Promise<TenantAccess[]> {
    return (await this.fetchAuthorization(user)).tenantAccess;
  }

  static async fetchUserTenants(user: User): Promise<string[]> {
    return (await this.fetchUserAccess(user)).map((entry) => entry.tenantId);
  }
}
