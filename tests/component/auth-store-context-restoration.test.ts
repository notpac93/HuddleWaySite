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
  availableTenants,
  tenantNamesStore,
  tenantIdStore,
} from "../../src/lib/authStore";
import {
  readCrmContext,
  writeCrmContext,
} from "../../src/lib/crm/crmContextPersistence";

describe("CRM authorization restores persisted organization safely", () => {
  beforeEach(() => {
    localStorage.clear();
    tenantIdStore.set(null);
    availableTenants.set([]);
    tenantNamesStore.set({});
    authMocks.fetchAuthorization.mockReset();
    authMocks.signOut.mockReset();
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
