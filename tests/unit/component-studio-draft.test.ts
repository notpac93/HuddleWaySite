import { describe, expect, it } from "vitest";
import type {
  CrmComponentDefinition,
  CrmComponentStudioPage,
} from "../../src/lib/api/BackendApi";
import {
  createComponent,
  definitionAvailable,
  publishPayload,
  componentChangeSummary,
  validatePages,
} from "../../src/components/crm/app-studio/componentStudioDraft";

const definition: CrmComponentDefinition = {
  id: "about_program",
  type: "about_section",
  label: "About Program",
  category: "Content",
  definitionVersion: 2,
  repeatable: false,
  fields: [{ id: "title", type: "text", required: true, maxLength: 80 }],
  defaultContent: { title: "About us" },
  presets: [],
  previewSpec: {
    title: "About",
    description: "Program introduction",
    highlights: [],
  },
};

const page: CrmComponentStudioPage = {
  id: "home_page",
  title: "Home",
  headline: "",
  subheader: "",
  route: "/",
  isVisible: true,
  status: "published",
  components: [],
};

describe("component studio draft", () => {
  it("creates a stable canonical instance and enforces non-repeatable definitions", () => {
    const component = createComponent(definition, page);
    expect(component).toMatchObject({
      definitionId: "about_program",
      definitionVersion: 2,
      type: "about_section",
      content: { title: "About us" },
    });
    expect(
      definitionAvailable(definition, { ...page, components: [component] }),
    ).toBe(false);
  });

  it("validates required fields and duplicate visible heroes", () => {
    const component = createComponent(definition, page);
    component.content.title = "";
    expect(
      validatePages([{ ...page, components: [component] }], [definition]),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldId: "title" })]),
    );
  });

  it("preserves order and archives only removed published identities", () => {
    const first = createComponent(definition, page);
    first.id = "about_1";
    const second = { ...first, id: "about_2" };
    const snapshot = {
      tenantId: "tenant-a",
      templateId: "base",
      templateVersion: 1,
      versionToken: "v1",
      definitions: [definition],
      pages: [{ ...page, components: [first, second] }],
      requestId: "request-1",
    };
    const payload = publishPayload(snapshot, [
      { ...page, components: [second] },
    ]);
    expect(payload.pages[0].components.map((item) => item.id)).toEqual([
      "about_2",
    ]);
    expect(payload.staleComponentIds).toEqual(["about_1"]);
  });

  it("summarizes content, order, visibility, additions, and removals for review", () => {
    const first = { ...createComponent(definition, page), id: "about_1", label: "Story", status: "published" };
    const second = { ...first, id: "about_2", label: "Values" };
    const added = { ...first, id: "about_3", label: "New section" };
    const before = [{ ...page, components: [first, second] }];
    const after = [{
      ...page,
      components: [
        { ...second, isVisible: false, content: { title: "Updated values" } },
        added,
      ],
    }];
    expect(componentChangeSummary(before, after)).toEqual(expect.arrayContaining([
      "Home: hide Values",
      "Home: update Values content",
      "Home: move Values to position 1",
      "Home: add New section",
      "Home: remove Story",
    ]));
  });
});
