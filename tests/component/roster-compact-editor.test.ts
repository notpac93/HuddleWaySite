import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import type { Component } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rosterPlayerDetails: vi.fn(),
  editRosterPlayer: vi.fn(),
}));
vi.mock("../../src/lib/authStore", async () => {
  const { writable } = await import("svelte/store");
  return { tenantIdStore: writable("tenant-a") };
});
vi.mock("../../src/lib/api/backendClient", () => ({ backendClient: mocks }));
import { tenantIdStore } from "../../src/lib/authStore";
import CompactRoster from "../../src/components/crm/roster/CompactRoster.svelte";
import RosterPlayerEditor from "../../src/components/crm/roster/RosterPlayerEditor.svelte";
const profile = {
  name: "Bryson Carter",
  ageGroup: "16U",
  grade: "10th",
  shirtSize: "S",
  shortsSize: "M",
  guardianName: "Sample Guardian",
  email: "sample@example.test",
  phone: "",
};
const details = () => ({
  tenantId: "tenant-a",
  registrationId: "reg-1",
  version: "version-1",
  profile: { ...profile },
  teamIds: ["blue"],
  seasonMemberships: [{ id: "fall-member", seasonId: "fall", teamId: "blue" }],
  billing: {
    totalCents: 25000,
    paidCents: 15000,
    remainingCents: 10000,
    currency: "USD",
  },
  requestId: "req-1",
});
const teams = [
  { id: "blue", name: "16U Blue" },
  { id: "gold", name: "18U Gold" },
];
const seasons = [
  { id: "fall", name: "Fall 2026", status: "active" },
  { id: "winter", name: "Winter 2027", status: "upcoming" },
];
beforeEach(() => {
  tenantIdStore.set("tenant-a");
  mocks.rosterPlayerDetails.mockReset().mockResolvedValue(details());
  mocks.editRosterPlayer
    .mockReset()
    .mockResolvedValue({
      success: true,
      tenantId: "tenant-a",
      registrationId: "reg-1",
    });
});
describe("Compact roster", () => {
  it("shows no selection controls and expands to only the three amounts", async () => {
    render(CompactRoster as unknown as Component, {
      players: [
        {
          id: "reg-1",
          name: profile.name,
          profile,
          team: "16U Blue",
          teamIds: ["blue"],
        },
      ],
      teams,
      seasons,
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/players ·|registrations need|Select players/),
    ).not.toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: /BC Bryson Carter/ }),
    );
    await waitFor(() =>
      expect(screen.getByText("$100.00")).toBeInTheDocument(),
    );
    const totals = screen.getByRole("region", {
      name: "Registration totals for Bryson Carter",
    });
    expect(within(totals).getByText("Total")).toBeInTheDocument();
    expect(within(totals).getByText("Paid")).toBeInTheDocument();
    expect(within(totals).getByText("Remaining")).toBeInTheDocument();
    expect(within(totals).queryByText(profile.name)).not.toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: "Edit Bryson Carter" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Age group")).toHaveValue("16U");
  });
  it("ignores a previous organization response", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.rosterPlayerDetails.mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    render(CompactRoster as unknown as Component, {
      players: [{ id: "reg-1", name: profile.name, profile }],
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /BC Bryson Carter/ }),
    );
    await act(async () => {
      tenantIdStore.set("tenant-b");
      resolve(details());
    });
    expect(screen.queryByText("$100.00")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Bryson Carter" }),
    ).not.toBeInTheDocument();
  });
});
describe("Player editor", () => {
  it("saves manual registration and team edits together without an override step", async () => {
    const onSaved = vi.fn();
    render(RosterPlayerEditor as unknown as Component, {
      details: details(),
      teams,
      seasons,
      onSaved,
      onClose: vi.fn(),
    });
    await fireEvent.input(screen.getByLabelText("Age group"), {
      target: { value: "18U" },
    });
    await fireEvent.input(screen.getByLabelText("Grade"), {
      target: { value: "11th" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Teams & seasons" }),
    );
    await fireEvent.change(screen.getByLabelText("Move to team"), {
      target: { value: "gold" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.editRosterPlayer).toHaveBeenCalledWith(
      "tenant-a",
      "reg-1",
      expect.objectContaining({
        version: "version-1",
        profile: expect.objectContaining({ ageGroup: "18U", grade: "11th" }),
        assignment: {
          action: "team",
          teamId: "gold",
          sourceMembershipId: "fall-member",
        },
      }),
      expect.any(String),
    );
    expect(screen.queryByText("Manual override")).not.toBeInTheDocument();
  });
  it.each([
    ["Move season", "move"],
    ["Add season", "add"],
  ])("saves %s with the source and destination", async (label, action) => {
    render(RosterPlayerEditor as unknown as Component, {
      details: details(),
      teams,
      seasons,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Teams & seasons" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: label }));
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.editRosterPlayer).toHaveBeenCalled());
    expect(mocks.editRosterPlayer.mock.calls[0][2].assignment).toEqual({
      action,
      teamId: "blue",
      seasonId: "winter",
      sourceMembershipId: "fall-member",
    });
  });
  it("keeps drafts open after a failed save and reuses its retry key", async () => {
    mocks.editRosterPlayer.mockRejectedValueOnce(new Error("offline"));
    render(RosterPlayerEditor as unknown as Component, {
      details: details(),
      teams,
      seasons,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    });
    await fireEvent.input(screen.getByLabelText("Age group"), {
      target: { value: "18U" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("Age group")).toHaveValue("18U");
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.editRosterPlayer).toHaveBeenCalledTimes(2),
    );
    expect(mocks.editRosterPlayer.mock.calls[0][3]).toBe(
      mocks.editRosterPlayer.mock.calls[1][3],
    );
  });
});
