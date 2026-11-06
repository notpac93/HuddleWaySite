import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';

export function wordingLimit(component: CrmPageComponent, field: { id: string; maxLength?: number; type?: string }) {
  if (component.type === 'hero_section') {
    const limits: Record<string, number> = { badgeText: 40, headline: 60, subheadline: 120, ctaLabel: 30 };
    if (limits[field.id]) return Math.min(limits[field.id], field.maxLength || Infinity);
  }
  return field.maxLength || (field.type === 'multiline_text' ? 1000 : 160);
}

export function wordingLabel(component: CrmPageComponent, field: { id: string; label?: string }) {
  const hero: Record<string, string> = { badgeText: 'Small header', headline: 'Main title', subheadline: 'Bottom line', ctaLabel: 'Button text' };
  return (component.type === 'hero_section' && hero[field.id]) || field.label || field.id;
}

export function restorePage(pages: CrmComponentStudioPage[], baseline: CrmComponentStudioPage[], pageId: string) {
  const original = baseline.find((page) => page.id === pageId);
  return original ? pages.map((page) => page.id === pageId ? structuredClone(original) : page) : pages;
}

export function pageHasEdits(pages: CrmComponentStudioPage[], baseline: CrmComponentStudioPage[], pageId: string) {
  return JSON.stringify(pages.find((page) => page.id === pageId)) !== JSON.stringify(baseline.find((page) => page.id === pageId));
}

export function connectedContentNotice(component: CrmPageComponent) {
  const content = component.content;
  if (['schedule_section', 'events_section'].includes(component.type) || content.dataBindingSource === 'events') {
    return 'This section uses shared event information. Event dates, locations, and recurring schedules come from Events and stay consistent wherever they appear. These edits change the section’s presentation.';
  }
  if (content.teamBindingMode === 'team' || content.teamBindingMode === 'all_teams') {
    return 'This section uses shared team and coach information. Names, profiles, and shared section titles stay consistent with Teams. Visibility is saved on this page.';
  }
  return '';
}

export function textRemovalAllowed(field: { id: string; type: string; required: boolean }) {
  return ['text', 'multiline_text'].includes(field.type) && !field.required;
}

export function sectionTextFields(component: CrmPageComponent, definition?: CrmComponentDefinition) {
  return (definition?.fields || []).filter((field) => ['text', 'multiline_text'].includes(field.type))
    .map((field) => ({ ...field, label: wordingLabel(component, field), maxLength: wordingLimit(component, field) }));
}
