import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import type { Component } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billingPackages: vi.fn(),
  saveBillingPackage: vi.fn(),
}));
vi.mock("../../src/lib/authStore", async () => {
  const { writable } = await import("svelte/store");
  return { tenantIdStore: writable("tenant-a") };
});
vi.mock("../../src/lib/services/DataStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    seasonsStore: writable([{ id: "season-secret", name: "Fall 12U" }]),
    teamsStore: writable([{ id: "team-secret", name: "Falcons" }]),
  };
});
vi.mock("../../src/lib/api/BillingOperationsApi", () => ({
  billingOperationsApi: mocks,
}));

import BillingPackagesWorkspace from "../../src/components/crm/billing/BillingPackagesWorkspace.svelte";

const Tested = BillingPackagesWorkspace as unknown as Component;

describe("CRM payment setup", () => {
  beforeEach(() => {
    mocks.billingPackages.mockReset().mockResolvedValue([]);
    mocks.saveBillingPackage
      .mockReset()
      .mockResolvedValue({ id: "package-secret" });
  });

  it("saves an explicit season split-payment choice with exact terms and no visible IDs", async () => {
    render(Tested);
    await screen.findByText("No season or team payment setup has been added.");
    await fireEvent.click(
      screen.getByRole("button", { name: "Add payment setup" }),
    );
    await fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Fall registration" },
    });
    await fireEvent.change(screen.getByRole("combobox", { name: "Season" }), {
      target: { value: "season-secret" },
    });
    await fireEvent.input(screen.getByLabelText("Season amount"), {
      target: { value: "1000.00" },
    });
    await fireEvent.click(screen.getByLabelText("Allow split payments"));
    await fireEvent.input(screen.getByLabelText("Cancellation information"), {
      target: { value: "Cancel before opening day." },
    });
    await fireEvent.input(screen.getByLabelText("Refund information"), {
      target: { value: "Refunds follow the posted policy." },
    });
    expect(screen.getByText(/Payment 1: \$333\.33 · due at enrollment/)).toBeVisible();
    expect(screen.getByText(/Payment 3: \$333\.34 · due 2 months after enrollment \(final payment\)/)).toBeVisible();
    expect(screen.queryByText("season-secret")).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: "Save payment setup" }),
    );
    await waitFor(() =>
      expect(mocks.saveBillingPackage).toHaveBeenCalledTimes(1),
    );
    expect(mocks.saveBillingPackage.mock.calls[0][1]).toMatchObject({
      name: "Fall registration",
      seasonId: "season-secret",
      lineItems: [{ kind: "season", amountCents: 100000 }],
      paymentTerms: {
        mode: "installments",
        adminChoiceConfirmed: true,
        installmentCount: 3,
        cadence: "monthly",
      },
    });
  });
});
