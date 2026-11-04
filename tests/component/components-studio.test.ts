import { act, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import type { Component } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function layoutSnapshot() {
  const value = snapshot();
  const about = value.definitions[1];
  value.definitions.push({ ...about, id: 'staff', label: 'Staff', type: 'coach_profiles', repeatable: true });
  value.pages[0].components.push({ ...value.pages[0].components[0], id: 'about_1',
    definitionId: about.id, definitionVersion: about.definitionVersion, type: about.type,
    label: about.label, content: { title: 'Our story' } });
  return value;
}

describe("ComponentsStudio", () => {
  it('follows preview tab navigation and preserves wording when returning Home', async () => {
    const data = layoutSnapshot();
    data.pages.push({ ...data.pages[0], id: 'schedule', title: 'Schedule', route: '/schedule', components: [] });
    data.pages.push({ ...data.pages[0], id: 'board', title: 'Board', route: '/messaging', components: [{ ...data.pages[0].components[1], id: 'board-note' }] });
    api.componentStudio.mockResolvedValue(data);
    const onPageDraftChange = vi.fn();
    const view = render(TestedComponentsStudio, { tenantId: 'tenant-a', configuration, configurationReady: true, previewOrigin: null, previewEnvironment: 'dev', canvasOnly: true, canvasEditing: true, externalCanvas: true, previewSynced: true, onPageDraftChange });
    await waitFor(() => expect(onPageDraftChange.mock.calls.at(-1)?.[0]?.id).toBe('home_page'));
    const editor = view.component as unknown as { handleCanvasAction(action: unknown): void };
    const field = { pageId: 'home_page', componentId: 'home_hero_1', fieldId: 'headline' };
    await act(() => editor.handleCanvasAction({ ...field, action: 'text-begin' }));
    await act(() => editor.handleCanvasAction({ ...field, action: 'text-change', value: 'Home draft survives tabs' }));
    await act(() => editor.handleCanvasAction({ action: 'navigate', pageId: 'home_page', route: '/schedule' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].route).toBe('/schedule');
    await act(() => editor.handleCanvasAction({ action: 'navigate', pageId: 'schedule', route: '/messaging' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components[0].id).toBe('board-note');
    await act(() => editor.handleCanvasAction({ action: 'navigate', pageId: 'board', route: '/' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components[0].content.headline).toBe('Home draft survives tabs');
  });

  it('uses preview commands for text and removal without opening a settings form', async () => {
    api.componentStudio.mockResolvedValue(layoutSnapshot());
    const onPageDraftChange = vi.fn();
    const view = render(TestedComponentsStudio, { tenantId: 'tenant-a', configuration, configurationReady: true,
      previewOrigin: null, previewEnvironment: 'dev', canvasOnly: true, canvasEditing: true, editSessionId: 'edit-1', externalCanvas: true, previewSynced: true, onPageDraftChange });
    await waitFor(() => expect(onPageDraftChange.mock.calls.at(-1)?.[0]?.components).toHaveLength(2));
    expect(screen.queryByLabelText('Headline')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Home Hero component' })).toBeNull();
    const editor = view.component as unknown as { handleCanvasAction(action: unknown): void };
    const target = { pageId: 'home_page', componentId: 'home_hero_1', fieldId: 'headline' };
    await act(() => editor.handleCanvasAction({ ...target, action: 'text-begin' }));
    await act(() => editor.handleCanvasAction({ ...target, action: 'text-change', value: 'Changed on canvas' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components[0].content.headline).toBe('Changed on canvas');
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    await act(() => editor.handleCanvasAction({ ...target, action: 'text-end' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
    await act(() => editor.handleCanvasAction({ pageId: 'home_page', componentId: 'about_1', action: 'remove' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components).toHaveLength(2);
    expect(api.publishPageLayout).not.toHaveBeenCalled();
  });

  it('allows exiting and retrying canvas mode after an authoring-load failure', async () => {
    api.componentStudio.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot());
    const onDone = vi.fn();
    const onPageDraftChange = vi.fn();
    render(TestedComponentsStudio, { tenantId: 'tenant-a', configuration, configurationReady: true,
      previewOrigin: null, previewEnvironment: 'dev', canvasOnly: true, canvasEditing: true, externalCanvas: true, onDone, onPageDraftChange });
    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onPageDraftChange.mock.calls.at(-1)?.[0]?.id).toBe('home_page'));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('removes an unconfirmed addition when edit mode ends', async () => {
    api.componentStudio.mockResolvedValue(layoutSnapshot());
    const onPageDraftChange = vi.fn();
    const view = render(TestedComponentsStudio, { tenantId: 'tenant-a', configuration, configurationReady: true,
      previewOrigin: null, previewEnvironment: 'dev', canvasOnly: true, canvasEditing: true, externalCanvas: true, onPageDraftChange });
    await waitFor(() => expect(onPageDraftChange.mock.calls.at(-1)?.[0]?.components).toHaveLength(2));
    const editor = view.component as unknown as { handleCanvasAction(action: unknown): void };
    await act(() => editor.handleCanvasAction({ action: 'add', pageId: 'home_page', definitionId: 'staff', beforeId: 'about_1' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components).toHaveLength(3);
    await view.rerender({ canvasEditing: false });
    const page = onPageDraftChange.mock.calls.at(-1)![0];
    expect(page.components).toHaveLength(2);
    expect(page.provisionalId).toBeNull();
    expect(page.editMode).toBe(false);
  });
  it('previews an exact insertion on the external canvas, cancels it, and supports undo/redo after adding', async () => {
    api.componentStudio.mockResolvedValue(layoutSnapshot());
    const onPageDraftChange = vi.fn();
    const view = render(TestedComponentsStudio, { tenantId: 'tenant-a', configuration, configurationReady: true,
      previewOrigin: null, previewEnvironment: 'dev', externalCanvas: true, previewSynced: true, onPageDraftChange });
    await screen.findByRole('button', { name: 'Edit About Program component' });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add here' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Preview and add' }));
    let draft = onPageDraftChange.mock.calls.at(-1)![0];
    expect(draft.components.map((item: { label: string }) => item.label)).toEqual(['Home Hero', 'Staff', 'About Program']);
    expect(screen.getByText('Published layout')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(document.querySelector('iframe')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: '+ Add here' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Preview and add' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add to page' }));
    expect(screen.getByText('Unpublished component changes')).toBeVisible();
    await view.rerender({ previewSynced: false });
    expect(screen.getByRole('button', { name: 'Publish components' })).toBeDisabled();
    await view.rerender({ previewSynced: true });
    expect(screen.getByRole('button', { name: 'Publish components' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onPageDraftChange.mock.calls.at(-1)![0].components).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    draft = onPageDraftChange.mock.calls.at(-1)![0];
    expect(draft.components.map((item: { label: string }) => item.label)).toEqual(['Home Hero', 'Staff', 'About Program']);
    expect(api.publishPageLayout).not.toHaveBeenCalled();
  });

  it('moves by stable neighbor, pins the hero, and preserves the updated order in the publish payload', async () => {
    const value = layoutSnapshot();
    value.pages[0].components.push({ ...value.pages[0].components[1], id: 'staff_1', definitionId: 'staff', label: 'Staff' });
    api.componentStudio.mockResolvedValue(value);
    renderStudio();
    await screen.findByRole('button', { name: 'Edit Staff component' });
    expect(screen.queryByRole('button', { name: 'Move Home Hero up' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move About Program up' })).toBeDisabled();
    await fireEvent.change(screen.getByRole('combobox', { name: 'Move Staff to' }), { target: { value: 'about_1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Publish components' }));
    await fireEvent.click(screen.getByRole('checkbox'));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    await waitFor(() => expect(api.publishPageLayout).toHaveBeenCalled());
    expect(api.publishPageLayout.mock.calls[0][1].pages[0].components.map((item: { id: string }) => item.id))
      .toEqual(['home_hero_1', 'staff_1', 'about_1']);
  });

  it('retains a draft after a server conflict and loads the latest version only on explicit discard', async () => {
    const value = snapshot();
    const latest = snapshot(); latest.versionToken = 'v2'; latest.pages[0].components[0].content.headline = 'New server wording';
    api.componentStudio.mockResolvedValueOnce(value).mockResolvedValue(latest);
    renderStudio();
    await screen.findByLabelText('Headline');
    await fireEvent.input(screen.getByLabelText('Headline'), { target: { value: 'Keep my draft' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Publish components' }));
    await fireEvent.click(screen.getByRole('checkbox'));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }));
    await screen.findByText(/Your draft is retained/);
    expect(screen.getByLabelText('Headline')).toHaveValue('Keep my draft');
    expect(api.publishPageLayout).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Headline')).toHaveValue('New server wording');
    expect(screen.getByText('Published layout')).toBeVisible();
  });
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    // Interaction tests model a positively intersecting preview; visibility and
    // timing boundaries are separately exercised by AppPreviewFrame tests.
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) { queueMicrotask(() => this.callback([
        { target, isIntersecting: true, intersectionRect: { width: 232, height: 503 } } as IntersectionObserverEntry,
      ], {} as IntersectionObserver)); }
      disconnect() {}
    });
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

  it("releases a hidden renderer without discarding component edits", async () => {
    const view = renderStudio();
    await fireEvent.click(await screen.findByRole("button", { name: "Edit Home Hero component" }));
    const oldFrame = screen.getByTitle("Home Hero isolated consumer preview");
    const oldSource = oldFrame.getAttribute('src');
    await fireEvent.input(screen.getByLabelText("Headline"), { target: { value: "Retained component draft" } });
    await view.rerender({ previewActive: false });
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(screen.getByLabelText("Headline")).toHaveValue("Retained component draft");
    await view.rerender({ previewActive: true });
    const newFrame = await screen.findByTitle("Home Hero isolated consumer preview");
    expect(newFrame).not.toBe(oldFrame);
    expect(newFrame.getAttribute('src')).not.toBe(oldSource);
    expect(screen.getByRole("button", { name: "Publish components" })).toBeEnabled();
    expect(api.componentStudio).toHaveBeenCalledTimes(1);
    expect(api.publishPageLayout).not.toHaveBeenCalled();
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
