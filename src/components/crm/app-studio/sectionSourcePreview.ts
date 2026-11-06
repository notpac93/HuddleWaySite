import type { CrmSectionSource } from '../../../lib/api/BackendApi';
import type { AppPagePreviewDraft } from '../../../lib/crm/appPreviewProtocol';

export function sectionSourcePreview(draft: AppPagePreviewDraft, sources: CrmSectionSource[]): AppPagePreviewDraft {
  return { ...draft, components: draft.components.map((component) => {
    const bound = sources.filter((source) => source.bindings.some((binding) => binding.pageId === draft.id && binding.componentId === component.id));
    const teams = bound.filter((source) => source.kind === 'team');
    const events = bound.filter((source) => source.kind === 'event').map((source) => ({ ...source.preview, ...source.values }));
    if (component.type === 'coach_grid' && teams.length && !(Array.isArray(component.content.profiles) && component.content.profiles.length)) {
      return { ...component, content: { ...component.content, bundleResolved: true, profiles: teams.flatMap((source) => [
        ...(source.values.coachName.trim() ? [{ id: `${source.id}_head`, name: source.values.coachName, role: source.values.coachRole, bio: source.preview?.bio || '', photo: source.preview?.photo || '' }] : []),
        ...(Array.isArray(source.preview?.assistants) ? source.preview.assistants : []),
      ]) } };
    }
    if (component.type === 'schedule_section' && events.length) {
      return { ...component, content: { ...component.content, bundleResolved: true, resolvedRows: events.map((event) => ({
        id: event.id, title: event.title, subtitle: event.location, dateLabel: event.dateLabel || '', event,
      })) } };
    }
    if (component.type === 'events_section' && events.length) {
      return { ...component, content: { ...component.content, bundleResolved: true, resolvedEvent: events[0], eventId: events[0].id } };
    }
    return component;
  }) };
}
