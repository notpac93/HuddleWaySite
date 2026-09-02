import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  callback: null as null | ((user: any) => Promise<void>),
  fetchAuthorization: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../src/lib/firebase", () => ({ auth: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    authMocks.callback = callback;
    return () => {};
  }),
  signOut: authMocks.signOut,
}));

vi.mock("../../src/lib/services/AuthService", () => ({
  AuthService: {
    fetchAuthorization: authMocks.fetchAuthorization,
  },
}));

import {
  authErrorStore,
  availableTenants,
  refreshAuthorization,
  tenantIdStore,
  tenantNamesStore,
  userStore,
} from "../../src/lib/authStore";
import {
  readCrmContext,
  writeCrmContext,
} from "../../src/lib/crm/crmContextPersistence";

describe("CRM authorization restores persisted organization safely", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    tenantIdStore.set(null);
    availableTenants.set([]);
    tenantNamesStore.set({});
    authMocks.fetchAuthorization.mockReset();
    authMocks.signOut.mockReset();
  });

  it('retries a temporary authorization read without signing the administrator out', async () => {
    vi.useFakeTimers();
    authMocks.fetchAuthorization
      .mockRejectedValueOnce(new Error('temporary Firestore failure'))
      .mockResolvedValue({
        tenantAccess: [{ tenantId: 'eagle', role: 'owner' }],
        canViewTenantOperations: false,
        tenantOperationsRole: null,
      });

    const pending = authMocks.callback?.({ uid: 'admin-a' });
    await vi.runAllTimersAsync();
    await pending;

    expect(authMocks.fetchAuthorization).toHaveBeenCalledTimes(2);
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(get(availableTenants)).toEqual(['eagle']);
    expect(get(authErrorStore)).toBe('');
  });

  it('keeps the Firebase session when organization access remains temporarily unavailable', async () => {
    vi.useFakeTimers();
    const signedInUser = { uid: 'admin-a' };
    authMocks.fetchAuthorization.mockRejectedValue(
      new Error('temporary Firestore failure'),
    );

    const pending = authMocks.callback?.(signedInUser);
    await vi.runAllTimersAsync();
    await pending;

    expect(authMocks.fetchAuthorization).toHaveBeenCalledTimes(3);
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(get(userStore)).toBe(signedInUser);
    expect(get(authErrorStore)).toMatch(/retry/i);
  });

  it('allows access to be retried without signing out', async () => {
    authMocks.fetchAuthorization.mockResolvedValue({
      tenantAccess: [{ tenantId: 'release-club', role: 'owner' }],
      canViewTenantOperations: false,
      tenantOperationsRole: null,
    });

    await refreshAuthorization({ uid: 'admin-a' } as any);

    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(get(tenantIdStore)).toBe('release-club');
  });

  it("restores a stored tenant only after current membership validation", async () => {
    writeCrmContext("admin-a", {
      tenantId: "release-club",
      page: "Financials",
    });
    authMocks.fetchAuthorization.mockResolvedValue({
      tenantAccess: [
        { tenantId: "eagle", role: "owner" },
        { tenantId: "release-club", role: "owner" },
      ],
      tenantNames: { eagle: "Eagle Select", "release-club": "Release Club" },
      canViewTenantOperations: false,
      tenantOperationsRole: null,
    });

    await authMocks.callback?.({ uid: "admin-a" });

    expect(get(tenantIdStore)).toBe("release-club");
    expect(get(availableTenants)).toEqual(["eagle", "release-club"]);
    expect(get(tenantNamesStore)).toEqual({
      eagle: "Eagle Select",
      "release-club": "Release Club",
    });
  });

  it("clears an unauthorized stored tenant and falls back without crossing users", async () => {
    writeCrmContext("admin-a", {
      tenantId: "secret-tenant",
      page: "Financials",
    });
    writeCrmContext("different-admin", {
      tenantId: "release-club",
      page: "Financials",
    });
    authMocks.fetchAuthorization.mockResolvedValue({
      tenantAccess: [{ tenantId: "eagle", role: "owner" }],
      tenantNames: { eagle: "Eagle Select" },
      canViewTenantOperations: false,
      tenantOperationsRole: null,
    });

    await authMocks.callback?.({ uid: "admin-a" });

    expect(get(tenantIdStore)).toBe("eagle");
    expect(readCrmContext("admin-a")).toBeNull();
    expect(readCrmContext("different-admin")).toEqual({
      tenantId: "release-club",
      page: "Financials",
    });
  });
});
