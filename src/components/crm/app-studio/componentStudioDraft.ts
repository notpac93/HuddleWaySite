import type {
  CrmComponentDefinition,
  CrmComponentStudioPage,
  CrmComponentStudioSnapshot,
  CrmPageComponent,
} from "../../../lib/api/BackendApi";

export type ComponentIssue = { fieldId: string; message: string };

export function clonePages(pages: CrmComponentStudioPage[]) {
  return structuredClone(pages);
}

export function pagesSignature(pages: CrmComponentStudioPage[]) {
  return JSON.stringify(pages);
}

export function componentState(
  component: CrmPageComponent,
  definition?: CrmComponentDefinition,
) {
  if (
    !definition ||
    component.definitionVersion !== definition.definitionVersion
  ) {
    return "Needs attention";
  }
  if (!component.enabled || !component.isVisible) return "Hidden";
  return component.status === "published" ? "Live" : "Draft";
}

export function fieldLabel(fieldId: string) {
  return fieldId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function validateComponent(
  component: CrmPageComponent,
  definition?: CrmComponentDefinition,
) {
  const issues: ComponentIssue[] = [];
  if (!definition) {
    return [
      {
        fieldId: "",
        message:
          "This legacy component has no current definition and is preserved read-only.",
      },
    ];
  }
  if (component.definitionVersion !== definition.definitionVersion) {
    issues.push({
      fieldId: "",
      message: `Version ${component.definitionVersion} needs migration to ${definition.definitionVersion}.`,
    });
  }
  for (const field of definition.fields) {
    const value = component.content[field.id];
    const empty =
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (field.required && empty) {
      issues.push({
        fieldId: field.id,
        message: `${field.label || fieldLabel(field.id)} is required.`,
      });
    }
    if (
      typeof value === "string" &&
      field.maxLength &&
      value.length > field.maxLength
    ) {
      issues.push({
        fieldId: field.id,
        message: `${field.label || fieldLabel(field.id)} is too long.`,
      });
    }
    if (field.type === "url" && value && typeof value === "string") {
      const relative = value.startsWith("/") && !value.startsWith("//");
      const secure = /^https:\/\/[^/]/i.test(value);
      if (
        (field.urlRule === "relative" && !relative) ||
        (field.urlRule !== "relative" && !relative && !secure)
      ) {
        issues.push({
          fieldId: field.id,
          message: `${field.label || fieldLabel(field.id)} must be a safe link.`,
        });
      }
    }
  }
  return issues;
}

export function validatePages(
  pages: CrmComponentStudioPage[],
  definitions: CrmComponentDefinition[],
) {
  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const issues: ComponentIssue[] = [];
  const instanceIds = new Set<string>();
  for (const page of pages) {
    let heroCount = 0;
    for (const component of page.components) {
      if (instanceIds.has(component.id)) {
        issues.push({
          fieldId: "",
          message: `Component ID ${component.id} is duplicated.`,
        });
      }
      instanceIds.add(component.id);
      if (
        component.type === "hero_section" &&
        component.enabled &&
        component.isVisible
      )
        heroCount += 1;
      issues.push(
        ...validateComponent(
          component,
          definitionsById.get(component.definitionId),
        ),
      );
    }
    if (heroCount > 1) {
      issues.push({
        fieldId: "",
        message: `${page.title} can contain only one visible hero.`,
      });
    }
  }
  return issues;
}

export function definitionAvailable(
  definition: CrmComponentDefinition,
  page: CrmComponentStudioPage,
) {
  if (definition.repeatable) return true;
  return !page.components.some(
    (component) => component.definitionId === definition.id,
  );
}

export function createComponent(
  definition: CrmComponentDefinition,
  page: CrmComponentStudioPage,
) {
  const token =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ||
    `${Date.now()}`;
  return {
    id: `${page.id}_${definition.id}_${token}`.slice(0, 200),
    definitionId: definition.id,
    definitionVersion: definition.definitionVersion,
    type: definition.type,
    label: definition.label,
    enabled: true,
    presetId: null,
    starterContentReviewKey: null,
    isVisible: true,
    status: "draft",
    content: structuredClone(definition.defaultContent),
  } satisfies CrmPageComponent;
}

export function publishPayload(
  snapshot: CrmComponentStudioSnapshot,
  pages: CrmComponentStudioPage[],
) {
  return {
    templateId: snapshot.templateId,
    templateVersion: snapshot.templateVersion,
    expectedVersionToken: snapshot.versionToken,
    pages,
    stalePageIds: [],
    staleComponentIds: snapshot.pages
      .flatMap((page) => page.components)
      .filter(
        (published) =>
          !pages.some((page) =>
            page.components.some((draft) => draft.id === published.id),
          ),
      )
      .map((component) => component.id),
  };
}

export function componentChangeSummary(
  before: CrmComponentStudioPage[],
  after: CrmComponentStudioPage[],
) {
  const changes: string[] = [];
  const beforeById = new Map(before.map((page) => [page.id, page]));
  for (const page of after) {
    const priorPage = beforeById.get(page.id);
    const priorComponents = new Map((priorPage?.components || []).map((component) => [component.id, component]));
    const nextIds = new Set(page.components.map((component) => component.id));
    for (const component of page.components) {
      const prior = priorComponents.get(component.id);
      if (!prior) {
        changes.push(`${page.title}: add ${component.label}`);
        continue;
      }
      const beforeVisible = prior.enabled && prior.isVisible;
      const afterVisible = component.enabled && component.isVisible;
      if (beforeVisible !== afterVisible) {
        changes.push(`${page.title}: ${afterVisible ? 'show' : 'hide'} ${component.label}`);
      }
      if (JSON.stringify(prior.content) !== JSON.stringify(component.content)) {
        changes.push(`${page.title}: update ${component.label} content`);
      }
      const beforeIndex = priorPage?.components.findIndex((candidate) => candidate.id === component.id) ?? -1;
      const afterIndex = page.components.findIndex((candidate) => candidate.id === component.id);
      if (beforeIndex !== afterIndex) changes.push(`${page.title}: move ${component.label} to position ${afterIndex + 1}`);
    }
    for (const component of priorPage?.components || []) {
      if (!nextIds.has(component.id)) changes.push(`${page.title}: remove ${component.label}`);
    }
  }
  return [...new Set(changes)];
}
