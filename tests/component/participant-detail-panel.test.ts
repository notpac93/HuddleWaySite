import { fireEvent, render, screen } from "@testing-library/svelte";
import type { Component } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  participantRelationships: vi.fn(),
  participantInstallmentAgreements: vi.fn(),
  participantTechnicalDetails: vi.fn(),
  previewRosterTransfer: vi.fn(),
  commitRosterTransfer: vi.fn(),
  proposeParticipantInstallmentRevision: vi.fn(),
}));
vi.mock("../../src/lib/authStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    tenantIdStore: writable("tenant-a"),
    activeTenantRole: writable("owner"),
  };
});
vi.mock("../../src/lib/api/backendClient", () => ({ backendClient: mocks }));

import ParticipantDetailPanel from "../../src/components/crm/roster/ParticipantDetailPanel.svelte";

const Tested = ParticipantDetailPanel as unknown as Component;
const player = {
  id: "registration-secret",
  participantId: "participant-secret",
  name: "Jordan Player",
  imageUrl: null,
  role: "Player",
  status: "Active",
  teamId: null,
  teamIds: [],
  team: "Unassigned",
  email: "family@example.test",
};

describe("participant detail panel", () => {
  beforeEach(() => {
    mocks.participantRelationships.mockResolvedValue({
      relationships: [
        {
          teamId: "team-secret",
          name: "Falcons",
          division: "12U",
          role: "Player",
          status: "Active",
          availability: "",
        },
      ],
      options: [{ teamId: "team-secret", name: "Falcons", division: "12U" }],
      canAssign: true,
      assignmentBlockedReason: null,
    });
    mocks.participantInstallmentAgreements.mockResolvedValue([]);
    mocks.participantTechnicalDetails.mockResolvedValue({
      entries: [{ label: "Participant ID", value: "participant-secret" }],
    });
    mocks.previewRosterTransfer.mockResolvedValue({
      changeSetHash: "a".repeat(64),
      registrationIds: [player.id],
      destinationTeamId: null,
    });
    mocks.commitRosterTransfer.mockResolvedValue({
      preview: { addCount: 0, removeCount: 1, noOpCount: 0 },
    });
    mocks.proposeParticipantInstallmentRevision.mockResolvedValue({});
  });

  it("keeps identifiers hidden until an owner explicitly opens them", async () => {
    render(Tested, { player });
    expect(await screen.findByText("Falcons")).toBeVisible();
    expect(screen.queryByText("participant-secret")).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: "Open technical details" }),
    );
    expect(await screen.findByText("participant-secret")).toBeVisible();
  });

  it("reverts locally and publishes only through preview then commit", async () => {
    render(Tested, { player });
    await screen.findByText("Falcons");
    const select = screen.getByLabelText("Stage a team change");
    await fireEvent.change(select, { target: { value: "unassigned" } });
    await fireEvent.click(screen.getByRole("button", { name: "Revert" }));
    expect(mocks.previewRosterTransfer).not.toHaveBeenCalled();
    expect(mocks.commitRosterTransfer).not.toHaveBeenCalled();
    await fireEvent.change(select, { target: { value: "unassigned" } });
    await fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.previewRosterTransfer).toHaveBeenCalledTimes(1);
    expect(mocks.commitRosterTransfer).toHaveBeenCalledTimes(1);
  });

  it("proposes participant-specific future payment changes", async () => {
    mocks.participantInstallmentAgreements.mockResolvedValueOnce([
      {
        id: "agreement-secret",
        offering: { label: "Fall season" },
        terms: { currency: "USD" },
        revision: 2,
        status: "active",
        providerSyncState: "confirmed",
        billingRecoveryState: null,
        pendingRevision: null,
        installments: [
          {
            number: 1,
            amountCents: 33334,
            dueAt: "2026-11-15T17:00:00.000Z",
            dueDate: "2026-11-15",
            dueDateLabel: "Nov 15, 2026",
            status: "pending",
          },
        ],
      },
    ]);
    render(Tested, { player });
    await fireEvent.click(
      await screen.findByRole("button", { name: "Manage future payments" }),
    );
    await fireEvent.input(screen.getByLabelText("Payment 1"), {
      target: { value: "300.00" },
    });
    await fireEvent.input(screen.getByLabelText("Reason"), {
      target: { value: "Approved family accommodation." },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(mocks.proposeParticipantInstallmentRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: "participant-secret",
        agreementId: "agreement-secret",
        data: expect.objectContaining({
          expectedRevision: 2,
          action: "replace_future",
          futureInstallments: [{ amountCents: 30000, dueDate: "2026-11-15" }],
        }),
      }),
    );
  });
});
