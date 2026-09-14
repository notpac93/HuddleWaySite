import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import type { Component } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmComponentStudioSnapshot } from "../../src/lib/api/BackendApi";

const api = vi.hoisted(() => ({
  componentStudio: vi.fn(),
  publishPageLayout: vi.fn(),
}));

vi.mock("../../src/lib/api/backendClient", () => ({ backendClient: api }));

import ComponentsStudio from "../../src/components/crm/app-studio/ComponentsStudio.svelte";

const TestedComponentsStudio = ComponentsStudio as unknown as Component;
const configuration = {
  name: "Alpha League",
  primaryColor: "#112233",
  secondaryColor: "#223344",
  tertiaryColor: "#ffffff",
  logoUrl: null,
  navigationTabs: [],
};

function snapshot(): CrmComponentStudioSnapshot {
  return {
    tenantId: "tenant-a",
    templateId: "huddleway_base_v1",
    templateVersion: 1,
    versionToken: "layout-v1",
    requestId: "request-1",
    definitions: [
      {
        id: "home_hero",
        type: "hero_section",
        label: "Home Hero",
        category: "Home",
        definitionVersion: 3,
        repeatable: false,
        fields: [
          {
            id: "headline",
            type: "text",
            required: true,
            maxLength: 80,
            previewTarget: "hero.headline",
          },
        ],
        defaultContent: { headline: "Welcome families" },
        presets: [],
        previewSpec: {
          title: "Welcome",
          description: "Welcome message and main action",
          highlights: [],
        },
      },
      {
        id: "about_program",
        type: "about_section",
        label: "About Program",
        category: "Content",
        definitionVersion: 2,
        repeatable: false,
        fields: [{ id: "title", type: "text", required: true }],
        defaultContent: { title: "About us" },
        presets: [],
        previewSpec: {
          title: "About",
          description: "Program introduction",
          highlights: [],
        },
      },
    ],
    pages: [
      {
        id: "home_page",
        title: "Home",
        headline: "",
        subheader: "",
        route: "/",
        isVisible: true,
        status: "published",
        components: [
          {
            id: "home_hero_1",
            definitionId: "home_hero",
            definitionVersion: 3,
            type: "hero_section",
            label: "Home Hero",
            enabled: true,
            presetId: null,
            starterContentReviewKey: null,
            isVisible: true,
            status: "published",
            content: { headline: "Welcome families" },
          },
        ],
      },
    ],
  };
}

function renderStudio() {
  return render(TestedComponentsStudio, {
    tenantId: "tenant-a",
    configuration,
    configurationReady: true,
    previewOrigin: "https://preview.example.test",
    previewEnvironment: "dev",
  });
}

describe("ComponentsStudio", () => {
  beforeEach(() => {
    api.componentStudio.mockReset();
    api.componentStudio.mockResolvedValue(snapshot());
    api.publishPageLayout.mockReset();
    api.publishPageLayout.mockResolvedValue({ success: true });
  });

  it("opens one live isolated renderer and maps field edits into its draft", async () => {
    renderStudio();
    await fireEvent.click(
      await screen.findByRole("button", { name: "Edit Home Hero component" }),
    );
    expect(
      screen.getByTitle("Home Hero isolated consumer preview"),
    ).toBeVisible();
    await fireEvent.input(screen.getByLabelText("Headline"), {
      target: { value: "A place for every family" },
    });
    expect(screen.getByText("Unpublished component changes")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Publish components" }),
    ).toBeEnabled();
  });

  it("previews a library definition before adding it to the draft", async () => {
    renderStudio();
    await fireEvent.click(await screen.findByRole("button", { name: "+ Add" }));
    const buttons = screen.getAllByRole("button", { name: "Preview and add" });
    await fireEvent.click(buttons[0]);
    expect(await screen.findByText("Preview before adding")).toBeVisible();
    expect(
      screen.getByTitle("About Program isolated consumer preview"),
    ).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Add to page" }));
    expect(
      screen.getByText(/Component added to the unpublished draft/),
    ).toBeVisible();
  });

  it("keeps the current component in context after discarding its edits", async () => {
    renderStudio();
    await fireEvent.click(
      await screen.findByRole("button", { name: "Edit Home Hero component" }),
    );
    await fireEvent.input(screen.getByLabelText("Headline"), {
      target: { value: "Temporary draft" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByLabelText("Headline")).toHaveValue("Welcome families");
    expect(screen.getByText("Editing component")).toBeVisible();
    expect(screen.getByTitle("Home Hero isolated consumer preview")).toBeVisible();
  });

  it("checks the server version before publishing the canonical layout", async () => {
    renderStudio();
    await fireEvent.click(
      await screen.findByRole("button", { name: "Edit Home Hero component" }),
    );
    await fireEvent.input(screen.getByLabelText("Headline"), {
      target: { value: "Updated welcome" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Publish components" }),
    );
    await fireEvent.click(screen.getByRole("checkbox"));
    await fireEvent.click(screen.getByRole("button", { name: "Confirm and publish" }));
    await waitFor(() =>
      expect(api.publishPageLayout).toHaveBeenCalledWith(
        "tenant-a",
        expect.objectContaining({
          templateId: "huddleway_base_v1",
          pages: [
            expect.objectContaining({
              components: [
                expect.objectContaining({
                  content: { headline: "Updated welcome" },
                }),
              ],
            }),
          ],
        }),
        expect.any(String),
        expect.any(String),
      ),
    );
  });

  it("stages non-required removal and supports immediate undo", async () => {
    const withAbout = snapshot();
    withAbout.pages[0].components.push({
      id: "home_about_1",
      definitionId: "about_program",
      definitionVersion: 2,
      type: "about_section",
      label: "About Program",
      enabled: true,
      presetId: null,
      starterContentReviewKey: null,
      isVisible: true,
      status: "published",
      content: { headline: "About us" },
    });
    api.componentStudio.mockResolvedValue(withAbout);
    renderStudio();

    await fireEvent.click(
      await screen.findByRole("button", { name: "Edit About Program component" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: "Remove from page" }));
    expect(screen.getByRole("button", { name: "Undo removal" })).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(screen.getByText("Component removal was undone.")).toBeVisible();
    expect(screen.getByText("Editing component")).toBeVisible();
  });

  it("edits structured component rows one at a time", async () => {
    const withHighlights = snapshot();
    withHighlights.definitions.push({
      id: "why_us_v2",
      type: "about_section",
      label: "Why Us",
      category: "Content",
      definitionVersion: 2,
      repeatable: true,
      fields: [{ id: "highlights", type: "highlights", required: false, label: "Highlights" }],
      defaultContent: { highlights: [] },
      presets: [],
      previewSpec: { title: "Why Us", description: "Program highlights", highlights: [] },
    });
    withHighlights.pages[0].components.push({
      id: "why_us_1",
      definitionId: "why_us_v2",
      definitionVersion: 2,
      type: "about_section",
      label: "Why Us",
      enabled: true,
      presetId: null,
      starterContentReviewKey: null,
      isVisible: true,
      status: "published",
      content: { highlights: [] },
    });
    api.componentStudio.mockResolvedValue(withHighlights);
    renderStudio();

    await fireEvent.click(await screen.findByRole("button", { name: "Edit Why Us component" }));
    await fireEvent.click(screen.getByRole("button", { name: "Add Highlight" }));
    await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Expert coaching" } });
    expect(screen.getByRole("button", { name: "Expert coaching" })).toBeVisible();
    expect(screen.getByText("Unpublished component changes")).toBeVisible();
  });

  it("loads a retained layout as a reviewable rollback draft", async () => {
    const withHistory = snapshot();
    withHistory.versions = [{
      id: "retained-1",
      versionToken: "layout-v0",
      capturedAt: "2026-09-03T10:00:00.000Z",
      publishedBy: "owner-1",
      pages: [{ ...withHistory.pages[0], components: [{
        ...withHistory.pages[0].components[0],
        content: { headline: "Earlier welcome" },
      }] }],
    }];
    withHistory.historyTruncated = false;
    api.componentStudio.mockResolvedValue(withHistory);
    renderStudio();

    await fireEvent.click(await screen.findByRole("button", { name: "History" }));
    await fireEvent.click(screen.getByRole("button", { name: "Use as rollback draft" }));
    expect(screen.getByText(/Retained layout loaded as an unpublished rollback draft/)).toBeVisible();
    expect(screen.getByText("Unpublished component changes")).toBeVisible();
  });
});
