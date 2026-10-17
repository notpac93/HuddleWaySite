import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import type { Component } from "svelte";
import type { Writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Element.prototype.animate = vi.fn(() => ({
  cancel: vi.fn(),
  currentTime: 0,
  finished: Promise.resolve(),
  pause: vi.fn(),
  play: vi.fn(),
})) as unknown as typeof Element.prototype.animate;

vi.mock("../../src/lib/firebase", () => ({
  auth: {},
  db: {},
  firebaseEnvironment: { config: { projectId: "huddleway-dev" } },
  storage: {},
}));

vi.mock("../../src/lib/authStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    tenantIdStore: writable(null),
    userStore: writable(null),
    availableTenants: writable([]),
    tenantNamesStore: writable({}),
  };
});

vi.mock("../../src/lib/api/backendClient", () => ({
  backendClient: {
    crmTenantBranding: vi.fn(async (tenantId: string) => ({
      exists: true,
      branding: {
        name: tenantId === "tenant-b" ? "Bravo Club" : "Alpha Club",
        logoUrl: null,
        primaryColor: null,
        secondaryColor: null,
        tertiaryColor: null,
      },
    })),
  },
}));

vi.mock("../../src/lib/services/DataStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    registrationsStore: writable([
      {
        id: "player-1",
        participantName: "Alex Morgan",
        participantEmail: "alex@example.test",
      },
    ]),
    teamsStore: writable([{ id: "team-1", name: "Tigers", division: "U12" }]),
    eventsStore: writable([
      { id: "event-1", title: "Summer Skills Camp", type: "Camp" },
    ]),
    seasonsStore: writable([]),
    registrationsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: "",
      permissionDenied: false,
    }),
    teamsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: "",
      permissionDenied: false,
    }),
    eventsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: "",
      permissionDenied: false,
    }),
  };
});

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: "mock-document" })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    commit: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock("firebase/storage", () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
}));

import CrmShellSearchHarness from "../fixtures/CrmShellSearchHarness.svelte";
import CreateEventFormHarness from "../fixtures/CreateEventFormHarness.svelte";
import CreateRegistrationFormHarness from "../fixtures/CreateRegistrationFormHarness.svelte";
import {
  availableTenants,
  tenantNamesStore,
  tenantIdStore,
} from "../../src/lib/authStore";
import { signOut } from "firebase/auth";
import { portalDraftStore, registerPortalDraft } from '../../src/lib/ui/portalDraftGuard';

const TestedCrmShellSearchHarness =
  CrmShellSearchHarness as unknown as Component;
const TestedCreateEventFormHarness =
  CreateEventFormHarness as unknown as Component;
const TestedCreateRegistrationFormHarness =
  CreateRegistrationFormHarness as unknown as Component;
const tenantChoices = availableTenants as Writable<string[]>;
const tenantNames = tenantNamesStore as Writable<Record<string, string>>;
const tenants = tenantIdStore as Writable<string | null>;
const signOutMock = vi.mocked(signOut);

async function openSearchFor(query: string) {
  await fireEvent.click(
    screen.getByRole("button", {
      name: "Search across HuddleWay (Cmd+K)",
    }),
  );
  await fireEvent.input(
    await screen.findByPlaceholderText("Search players, teams, or events..."),
    { target: { value: query } },
  );
}

describe("CRM modal stacking and navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    portalDraftStore.set(null);
  });
  beforeEach(() => {
    tenantChoices.set([]);
    tenants.set(null);
    signOutMock.mockReset();
  });

  it('reveals Admin tabs over My App without leaving or resolving its draft', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(TestedCrmShellSearchHarness);
    await fireEvent.click(within(screen.getByRole('navigation', { name: 'Admin quick access' })).getByRole('button', { name: 'My App' }));
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('My App');
    expect(screen.queryByRole('navigation', { name: 'Admin quick access' })).toBeNull();
    const discard = vi.fn();
    registerPortalDraft({ id: 'my-app-configuration', title: 'App draft', message: 'Keep editing', onDiscard: discard });
    await fireEvent.click(screen.getByRole('button', { name: 'Admin tabs' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Admin quick access' })).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Hide tabs' }));
    expect(screen.queryByRole('navigation', { name: 'Admin quick access' })).toBeNull();
    expect(discard).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Admin tabs' }));
    await fireEvent.click(within(screen.getByRole('navigation', { name: 'Admin quick access' })).getByRole('button', { name: 'Events' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('My App');
    await fireEvent.click(screen.getByRole('button', { name: 'Hide tabs' }));
  });

  it('uses the shared modal shell with two actions and keeps a failed save open for retry', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(TestedCrmShellSearchHarness);
    const retain = vi.fn().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined);
    registerPortalDraft({ id: 'test-draft', title: 'Save your changes?', message: 'Save a draft to continue later.', onDiscard: vi.fn(), onRetain: retain });
    await fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.crm-ui-modal-shell')).not.toBeNull();
    expect(dialog.querySelectorAll('.draft-navigation-actions button')).toHaveLength(2);
    expect(within(dialog).queryByRole('button', { name: /Discard/ })).toBeNull();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft & leave' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeVisible());
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('Activity');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft & leave' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('Events');
    expect(retain).toHaveBeenCalledTimes(2);
  });

  it('opens More as a guarded page and returns from its child workspace', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    render(TestedCrmShellSearchHarness);
    const nav = within(screen.getByRole('navigation', { name: 'Admin quick access' }));
    const discard = vi.fn();
    registerPortalDraft({
      id: 'preview-text', title: 'Unsaved preview text', message: 'Keep editing or discard.',
      onDiscard: discard,
    });
    await fireEvent.click(nav.getByRole('button', { name: 'More, current section: Activity' }));
    expect(screen.queryByRole('region', { name: 'More' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(discard).not.toHaveBeenCalled();
    await fireEvent.click(nav.getByRole('button', { name: 'Events' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard & leave' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('Events'));
    expect(discard).toHaveBeenCalledOnce();

    await fireEvent.click(nav.getByRole('button', { name: 'More' }));
    const more = screen.getByRole('region', { name: 'More' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(more).queryByRole('button', { name: 'Events' })).toBeNull();
    expect(within(more).getByRole('button', { name: 'Roster' })).toBeVisible();
    expect(nav.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('button', { name: 'Events' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('status', { name: 'current tab' })).toBeNull();

    await fireEvent.click(within(more).getByRole('button', { name: 'Roster' }));
    await waitFor(() => expect(nav.getByRole('button', { name: 'More, current section: Roster' })).toBeVisible());
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('Roster');
    await fireEvent.click(screen.getByRole('button', { name: '← More' }));
    expect(screen.getByRole('region', { name: 'More' })).toBeVisible();
    await fireEvent.click(nav.getByRole('button', { name: 'Events' }));
    expect(screen.queryByRole('region', { name: 'More' })).toBeNull();
    expect(screen.getByRole('status', { name: 'current tab' })).toHaveTextContent('Events');
  });

  it("routes accessible player, team, and event search results and retains each ID", async () => {
    render(TestedCrmShellSearchHarness);

    const currentTab = screen.getByRole("status", { name: "current tab" });
    const currentResultId = screen.getByRole("status", {
      name: "current result id",
    });

    await openSearchFor("Summer");
    await fireEvent.click(
      screen.getByRole("button", { name: /Summer Skills Camp/ }),
    );
    expect(currentTab).toHaveTextContent("Events");
    expect(currentResultId).toHaveTextContent("event-1");
    expect(screen.getByRole("heading", { level: 1, name: "Events" })).toBeInTheDocument();

    await openSearchFor("Tigers");
    await fireEvent.click(screen.getByRole("button", { name: /Tigers/ }));
    expect(currentTab).toHaveTextContent("Teams");
    expect(currentResultId).toHaveTextContent("team-1");
    expect(screen.getByRole("heading", { level: 1, name: "Teams" })).toBeInTheDocument();

    await openSearchFor("Alex");
    await fireEvent.click(screen.getByRole("button", { name: /Alex Morgan/ }));
    expect(currentTab).toHaveTextContent("Roster");
    expect(currentResultId).toHaveTextContent("player-1");
    expect(screen.getByRole("heading", { level: 1, name: "Roster" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(currentTab).toHaveTextContent("Activity");
    expect(currentResultId).toHaveTextContent("");
    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toHaveFocus();
  });

  it("supports mobile navigation, Escape dismissal, and focus restoration", async () => {
    render(TestedCrmShellSearchHarness);
    const menuTrigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    await fireEvent.click(menuTrigger);
    const mobileNavigation = screen.getByRole("dialog", {
      name: "HuddleWay",
    });
    expect(mobileNavigation).toBeVisible();

    await fireEvent.keyDown(mobileNavigation, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "HuddleWay" })).toBeNull(),
    );
    await waitFor(() => expect(menuTrigger).toHaveFocus());

    const searchTrigger = screen.getByRole("button", {
      name: "Search across HuddleWay (Cmd+K)",
    });
    await fireEvent.click(searchTrigger);
    const searchInput = await screen.findByLabelText(
      "Search players, teams, or events",
    );
    await fireEvent.keyDown(searchInput, { key: "Escape" });
    await waitFor(() => expect(searchInput).not.toBeInTheDocument());
    await waitFor(() => expect(searchTrigger).toHaveFocus());

    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      await screen.findByLabelText("Search players, teams, or events"),
    ).toBeVisible();
  });

  it("switches organizations and retries a support-safe sign-out failure", async () => {
    tenants.set("tenant-a");
    tenantChoices.set(["tenant-a", "tenant-b"]);
    tenantNames.set({ "tenant-a": "Alpha Club", "tenant-b": "Bravo Club" });
    signOutMock
      .mockRejectedValueOnce(new Error("raw credential detail"))
      .mockResolvedValueOnce(undefined);
    render(TestedCrmShellSearchHarness);

    await fireEvent.click(screen.getByRole("button", { name: "Roster" }));
    expect(
      screen.getByRole("status", { name: "current tab" }),
    ).toHaveTextContent("Roster");

    await fireEvent.click(
      screen.getByRole("button", { name: "Switch organization" }),
    );
    expect(screen.queryByText(/tenant-b/i)).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Bravo Club" }));
    let currentTenant: string | null = null;
    let unsubscribe = tenants.subscribe((value) => {
      currentTenant = value;
    });
    unsubscribe();
    expect(currentTenant).toBe("tenant-b");
    expect(
      screen.getByRole("status", { name: "current tab" }),
    ).toHaveTextContent("Roster");

    tenants.set("tenant-a");

    await fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    await fireEvent.click(
      screen.getByRole("button", {
        name: "Bravo Club",
      }),
    );
    unsubscribe = tenants.subscribe((value) => {
      currentTenant = value;
    });
    unsubscribe();
    expect(currentTenant).toBe("tenant-b");

    await fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    const mobileNavigationForSignOut = screen.getByRole("dialog", {
      name: "Bravo Club",
    });
    await fireEvent.click(
      within(mobileNavigationForSignOut).getByRole("button", {
        name: "Sign out",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Sign Out" });
    await fireEvent.click(
      within(dialog).getByRole("button", { name: "Sign out" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign out could not be completed.",
    );
    expect(screen.queryByText("raw credential detail")).toBeNull();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "Sign out" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Sign Out" })).toBeNull();
    });
    expect(signOutMock).toHaveBeenCalledTimes(2);
  });

  it("advances event creation inside the panel without closing the modal", async () => {
    const view = render(TestedCreateEventFormHarness);

    await fireEvent.input(screen.getByLabelText("Event Title"), {
      target: { value: "Summer Practice" },
    });
    await fireEvent.change(screen.getByLabelText("Event Type *"), {
      target: { value: "Practice" },
    });
    await fireEvent.change(screen.getByLabelText("Team *"), {
      target: { value: "team-1" },
    });
    await fireEvent.click(screen.getByRole("radio", { name: /One-time/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Choose the event days")).toBeVisible();
    expect(
      screen.getByRole("status", { name: "event modal state" }),
    ).toHaveTextContent("open");

    const backdrop = view.container.querySelector<HTMLElement>(
      ".crm-ui-backdrop, .fixed.inset-0.z-0",
    );
    expect(backdrop).not.toBeNull();
    await fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "event modal state" }),
      ).toHaveTextContent("closed");
    });
  });

  it("advances registration creation and closes only from the backdrop", async () => {
    const view = render(TestedCreateRegistrationFormHarness);

    await fireEvent.input(screen.getByLabelText("Registration Title *"), {
      target: { value: "Fall Registration" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByText(
        "Each step appears in this order for future registrations.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("status", { name: "registration modal state" }),
    ).toHaveTextContent("open");

    const backdrop = view.container.querySelector<HTMLElement>(
      ".crm-ui-backdrop, .fixed.inset-0.z-0",
    );
    expect(backdrop).not.toBeNull();
    await fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "registration modal state" }),
      ).toHaveTextContent("closed");
    });
  });
});
