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
  baseline: CrmComponentStudioPage[] = [],
) {
  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const issues: ComponentIssue[] = [];
  const baselineByPage = new Map(baseline.map((page) => [page.id, page]));
  const instancePages = new Map<string, string>();
  for (const page of pages) {
    const pageIds = new Set<string>();
    const priorPage = baselineByPage.get(page.id);
    const heroes = page.components.filter((component) => component.type === 'hero_section');
    if ((!heroes.length && priorPage?.components.some((item) => item.type === 'hero_section')) ||
        (heroes.length && (heroes.length > 1 || page.components[0]?.type !== 'hero_section' ||
        !heroes[0].enabled || !heroes[0].isVisible))) {
      issues.push({ fieldId: '', message: `${page.title}: keep one visible hero pinned first.` });
    }
    for (const component of page.components) {
      const firstPage = instancePages.get(component.id);
      const prior = priorPage?.components.find((item) => item.id === component.id);
      const shared = firstPage && prior &&
        baselineByPage.get(firstPage)?.components.some((item) => item.id === component.id);
      if (pageIds.has(component.id) || (firstPage && !shared)) {
        issues.push({
          fieldId: "",
          message: `${page.title}: ${component.label} has a duplicate section reference.`,
        });
      }
      pageIds.add(component.id);
      if (!firstPage) instancePages.set(component.id, page.id);
      issues.push(
        ...validateComponent(
          component,
          definitionsById.get(component.definitionId),
        ).filter((issue) => !prior || (issue.fieldId
          ? JSON.stringify(component.content[issue.fieldId]) !== JSON.stringify(prior.content[issue.fieldId])
          : JSON.stringify(component.content) !== JSON.stringify(prior.content))),
      );
    }
  }
  return issues;
}

export function isHeroDefinition(definition: Pick<CrmComponentDefinition, 'type'>) {
  return ['hero', 'home_hero', 'hero_section'].includes(definition.type.trim().toLowerCase());
}

export function definitionAvailable(
  definition: CrmComponentDefinition,
  page: CrmComponentStudioPage,
) {
  if (page.components.length >= 40) return false;
  if (isHeroDefinition(definition)) return false;
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
    staleComponentIds: [...new Set(snapshot.pages
      .flatMap((page) => page.components)
      .filter(
        (published) =>
          !pages.some((page) =>
            page.components.some((draft) => draft.id === published.id),
          ),
      )
      .map((component) => component.id))],
  };
}

function reviewFieldValue(value: unknown, previous: unknown): string {
  if (typeof value === 'string') return value.trim() ? `“${value}”` : 'Removed';
  if (Array.isArray(value)) {
    const prior = new Set(Array.isArray(previous) ? previous.map((item) => JSON.stringify(item)) : []);
    const names = value.filter((item) => !prior.has(JSON.stringify(item))).flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const label = item.title ?? item.name ?? item.label;
      return typeof label === 'string' && label.trim() ? [label] : [];
    });
    const count = `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
    return names.length ? `${count} · ${names.slice(0, 3).join(', ')}` : count;
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  return value == null ? 'Removed' : 'Updated';
}

export function componentChangeSummary(
  before: CrmComponentStudioPage[],
  after: CrmComponentStudioPage[],
  definitions: CrmComponentDefinition[] = [],
) {
  const changes: string[] = [];
  const fieldChanges = new Map<string, { pageTitles: Set<string>; detail: string }>();
  const beforeById = new Map(before.map((page) => [page.id, page]));
  for (const page of after) {
    const priorPage = beforeById.get(page.id);
    if (!priorPage) changes.push(`Add the ${page.title} page`);
    else {
      if (priorPage.title !== page.title) changes.push(`Page name · “${page.title}”`);
      if (priorPage.isVisible !== page.isVisible) changes.push(`${page.isVisible ? 'Show' : 'Hide'} the ${page.title} page`);
      for (const [key, label] of [['headline', 'Page headline'], ['subheader', 'Page subheader'], ['route', 'Page destination']] as const) {
        if (priorPage[key] !== page[key]) changes.push(`${page.title} · ${label} · ${page[key] || 'Removed'}`);
      }
    }
    const priorComponents = new Map((priorPage?.components || []).map((component) => [component.id, component]));
    const nextIds = new Set(page.components.map((component) => component.id));
    const previousOrder = (priorPage?.components || []).filter((component) => nextIds.has(component.id)).map(({ id }) => id);
    const nextOrder = page.components.filter((component) => priorComponents.has(component.id)).map(({ id }) => id);
    if (previousOrder.some((id, index) => id !== nextOrder[index])) {
      changes.push(`${page.title} · Section order · ${page.components.map(({ label }) => label).join(' / ')}`);
    }
    for (const component of page.components) {
      const prior = priorComponents.get(component.id);
      if (!prior) {
        changes.push(`${page.title} · Add ${component.label}`);
        continue;
      }
      const beforeVisible = prior.enabled && prior.isVisible && prior.content.hideSection !== true;
      const afterVisible = component.enabled && component.isVisible && component.content.hideSection !== true;
      if (beforeVisible !== afterVisible) {
        changes.push(`${page.title} · ${afterVisible ? 'Show' : 'Hide'} ${component.label}`);
      }
      const publishedContent = { ...prior.content };
      const editedContent = { ...component.content };
      delete publishedContent.hideSection;
      delete editedContent.hideSection;
      if (publishedContent.ctaLabel !== editedContent.ctaLabel) {
        delete publishedContent.showCtaButton;
        delete editedContent.showCtaButton;
      }
      if (JSON.stringify(publishedContent) !== JSON.stringify(editedContent)) {
        const fields = definitions.find(({ id }) => id === component.definitionId)?.fields || [];
        const changed = fields.filter(({ id }) => JSON.stringify(publishedContent[id]) !== JSON.stringify(editedContent[id]));
        for (const field of changed) {
          const detail = reviewFieldValue(component.content[field.id], prior.content[field.id]);
          const key = JSON.stringify([component.id, component.label, field.id, detail]);
          const change = fieldChanges.get(key) || { pageTitles: new Set(), detail: `${component.label} · ${field.label || fieldLabel(field.id)} · ${detail}` };
          change.pageTitles.add(page.title);
          fieldChanges.set(key, change);
        }
        if (!changed.length) changes.push(`${page.title} · ${component.label} content updated`);
      }
    }
    for (const component of priorPage?.components || []) {
      if (!nextIds.has(component.id)) changes.push(`${page.title} · Remove ${component.label}`);
    }
  }
  for (const { pageTitles, detail } of fieldChanges.values()) changes.push(`${[...pageTitles].join(', ')} · ${detail}`);
  return [...new Set(changes)];
}
