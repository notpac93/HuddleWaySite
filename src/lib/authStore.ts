import { derived, get, writable } from 'svelte/store';
import { auth } from './firebase';
import { authorizedEntryProgram, requestedAdminProgram, clearRequestedAdminProgram } from './crm/adminEntryContext';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { authorizationFailure } from './api/credentialBoundary';
import { notifyNativeAuthorization } from './crm/nativeWorkspaceContext';
import {
  AuthService,
  type TenantAccess,
  type TenantOperationsRole,
  type TenantRole,
} from "./services/AuthService";
import {
  clearCrmContext,
  readCrmContext,
  resolveAuthorizedTenant,
} from "./crm/crmContextPersistence";

export const userStore = writable<User | null>(null);
export const tenantIdStore = writable<string | null>(null);
export const availableTenants = writable<string[]>([]);
export const tenantNamesStore = writable<Record<string, string>>({});
export const tenantAccessStore = writable<TenantAccess[]>([]);
export const canViewTenantOperationsStore = writable<boolean>(false);
export const tenantOperationsRoleStore = writable<TenantOperationsRole | null>(
  null,
);
export const isAuthLoading = writable<boolean>(true);
export const authErrorStore = writable<string>("");
export const activeTenantRole = derived(
  [tenantIdStore, tenantAccessStore],
  ([$tenantId, $access]): TenantRole | null =>
    $access.find((entry) => entry.tenantId === $tenantId)?.role ?? null,
);

const AUTHORIZATION_RETRY_DELAYS_MS = [0, 300, 900] as const;
let authorizationSequence = 0;

function clearAuthorizationState() {
  tenantAccessStore.set([]);
  tenantNamesStore.set({});
  canViewTenantOperationsStore.set(false);
  tenantOperationsRoleStore.set(null);
  availableTenants.set([]);
  tenantIdStore.set(null);
}

async function fetchAuthorizationWithRetry(user: User, sequence: number) {
  let attempt = 0;
  let lastError: unknown;
  for (const delayMs of AUTHORIZATION_RETRY_DELAYS_MS) {
    if (delayMs) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
    const startedAt = Date.now();
    attempt += 1;
    try {
      return await AuthService.fetchAuthorization(user);
    } catch (error) {
      lastError = error;
      if (sequence === authorizationSequence) notifyNativeAuthorization({
        state: 'attempt_failed', attempt, elapsedMs: Date.now() - startedAt,
        ...authorizationFailure(error),
      });
    }
  }
  throw lastError;
}

async function refreshAuthorizationForUser(user: User, sequence: number) {
  try {
    const authorization = await fetchAuthorizationWithRetry(user, sequence);
    if (sequence !== authorizationSequence) return false;
    const access = authorization.tenantAccess;
    const tenants = access.map((entry) => entry.tenantId);
    const currentTenant = get(tenantIdStore);
    const persistedContext = readCrmContext(user.uid);
    const restoredTenant = resolveAuthorizedTenant(
      tenants,
      authorizedEntryProgram(tenants, requestedAdminProgram(typeof window === 'undefined' ? undefined : window.location), currentTenant),
      persistedContext,
    );
    if (
      persistedContext
      && !tenants.includes(persistedContext.tenantId)
    ) {
      clearCrmContext(user.uid);
    }
    tenantAccessStore.set(access);
    tenantNamesStore.set(authorization.tenantNames ?? {});
    canViewTenantOperationsStore.set(
      authorization.canViewTenantOperations,
    );
    tenantOperationsRoleStore.set(authorization.tenantOperationsRole);
    availableTenants.set(tenants);
    tenantIdStore.set(restoredTenant);
    clearRequestedAdminProgram();
    authErrorStore.set('');
    notifyNativeAuthorization({ state: 'resolved' });
    return true;
  } catch {
    if (sequence !== authorizationSequence) return false;
    console.error('Could not load administrator access. Keeping the authenticated session available for retry.');
    authErrorStore.set(
      'Your organization access could not be verified. Check your connection and retry.',
    );
    clearAuthorizationState();
    notifyNativeAuthorization({ state: 'exhausted' });
    return false;
  }
}

export async function refreshAuthorization(user = auth.currentUser) {
  if (!user) return false;
  const sequence = ++authorizationSequence;
  notifyNativeAuthorization({ state: 'retry_requested' });
  isAuthLoading.set(true);
  authErrorStore.set('');
  try {
    return await refreshAuthorizationForUser(user, sequence);
  } finally {
    if (sequence === authorizationSequence) isAuthLoading.set(false);
  }
}

if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, async (user) => {
    const sequence = ++authorizationSequence;
    isAuthLoading.set(true);
    authErrorStore.set("");
    userStore.set(user);
    if (user) {
      await refreshAuthorizationForUser(user, sequence);
    } else {
      clearAuthorizationState();
    }
    if (sequence === authorizationSequence) isAuthLoading.set(false);
  });
}
