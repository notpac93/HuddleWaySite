const storagePrefix = 'huddleway.crm.context.v1';

export interface CrmContext {
  tenantId: string;
  page: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageKey(userId: unknown) {
  const normalized = String(userId ?? '').trim();
  return normalized ? `${storagePrefix}:${normalized}` : '';
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function clearCrmContext(
  userId: unknown,
  storage: StorageLike | null = browserStorage(),
) {
  const key = storageKey(userId);
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Browser storage is optional; authorization never depends on it.
  }
}

export function readCrmContext(
  userId: unknown,
  storage: StorageLike | null = browserStorage(),
): CrmContext | null {
  const key = storageKey(userId);
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tenantId = String(parsed.tenantId ?? '').trim();
    const page = String(parsed.page ?? '');
    if (
      !tenantId
      || !page
    ) {
      clearCrmContext(userId, storage);
      return null;
    }
    return { tenantId, page };
  } catch {
    clearCrmContext(userId, storage);
    return null;
  }
}

export function writeCrmContext(
  userId: unknown,
  context: CrmContext,
  storage: StorageLike | null = browserStorage(),
) {
  const key = storageKey(userId);
  const tenantId = String(context.tenantId ?? '').trim();
  const page = String(context.page ?? '');
  if (!key || !storage || !tenantId || !page) return;
  try {
    storage.setItem(key, JSON.stringify({ tenantId, page }));
  } catch {
    // Browser storage is optional; the in-memory CRM remains usable.
  }
}

export function resolveAuthorizedTenant(
  authorizedTenantIds: string[],
  currentTenantId: unknown,
  persistedContext: CrmContext | null,
) {
  const authorized = new Set(
    authorizedTenantIds.map((tenantId) => tenantId.trim()).filter(Boolean),
  );
  const current = String(currentTenantId ?? '');
  if (current && authorized.has(current)) return current;
  const persisted = persistedContext?.tenantId ?? '';
  if (persisted && authorized.has(persisted)) return persisted;
  return authorizedTenantIds.find((tenantId) => tenantId.trim())?.trim() ?? null;
}

export function resolveAuthorizedPage(
  persistedContext: CrmContext | null,
  tenantId: unknown,
  allowedPages: string[],
) {
  if (
    !persistedContext
    || persistedContext.tenantId !== String(tenantId ?? '')
    || !allowedPages.includes(persistedContext.page)
  ) return allowedPages[0] ?? '';
  return persistedContext.page;
}
