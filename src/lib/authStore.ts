import { derived, get, writable } from 'svelte/store';
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AuthService,
  type TenantAccess,
  type TenantOperationsRole,
  type TenantRole,
} from './services/AuthService';

export const userStore = writable<User | null>(null);
export const tenantIdStore = writable<string | null>(null);
export const availableTenants = writable<string[]>([]);
export const tenantAccessStore = writable<TenantAccess[]>([]);
export const canViewTenantOperationsStore = writable<boolean>(false);
export const tenantOperationsRoleStore =
  writable<TenantOperationsRole | null>(null);
export const isAuthLoading = writable<boolean>(true);
export const authErrorStore = writable<string>('');
export const activeTenantRole = derived(
  [tenantIdStore, tenantAccessStore],
  ([$tenantId, $access]): TenantRole | null =>
    $access.find((entry) => entry.tenantId === $tenantId)?.role ?? null,
);

if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, async (user) => {
    isAuthLoading.set(true);
    authErrorStore.set('');
    userStore.set(user);
    if (user) {
      try {
        const authorization = await AuthService.fetchAuthorization(user);
        const access = authorization.tenantAccess;
        const tenants = access.map((entry) => entry.tenantId);
        const currentTenant = get(tenantIdStore);
        tenantAccessStore.set(access);
        canViewTenantOperationsStore.set(
          authorization.canViewTenantOperations,
        );
        tenantOperationsRoleStore.set(authorization.tenantOperationsRole);
        availableTenants.set(tenants);
        tenantIdStore.set(
          currentTenant && tenants.includes(currentTenant)
            ? currentTenant
            : tenants[0] ?? null,
        );
      } catch {
        console.error('Could not load administrator access.');
        authErrorStore.set(
          'Your organization access could not be verified. Refresh or sign in again.',
        );
        tenantAccessStore.set([]);
        canViewTenantOperationsStore.set(false);
        tenantOperationsRoleStore.set(null);
        availableTenants.set([]);
        tenantIdStore.set(null);
      }
    } else {
      tenantAccessStore.set([]);
      canViewTenantOperationsStore.set(false);
      tenantOperationsRoleStore.set(null);
      availableTenants.set([]);
      tenantIdStore.set(null);
    }
    isAuthLoading.set(false);
  });
}
