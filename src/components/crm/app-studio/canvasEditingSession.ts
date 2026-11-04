import type { CanvasAction } from '../../../lib/crm/appPreviewProtocol';
import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';
import { definitionAvailable, validateComponent } from './componentStudioDraft';

type Context = {
  enabled(): boolean;
  page(): CrmComponentStudioPage | undefined;
  definitions(): CrmComponentDefinition[];
  provisional(): CrmPageComponent | null;
  select(id: string): void;
  beginText(): () => void;
  endText(): void;
  change(componentId: string, field: string, value: string): void;
  add(beforeId: string | null, definition: CrmComponentDefinition): void;
  confirm(): void;
  cancel(): void;
  remove(id: string): void;
  moveTo(id: string, beforeId: string | null): void;
  notice(message: string): void;
  navigate(route: string): void;
};

export function createCanvasEditingSession(context: Context) {
  let editing: { componentId: string; fieldId: string; restore: () => void } | null = null;
  const handle = (action: CanvasAction) => {
    const page = context.page();
    if (!context.enabled() || !page || action.pageId !== page.id) return;
    if (action.action === 'navigate' && action.route) { editing = null; context.endText(); context.navigate(action.route); return; }
    if (action.action === 'add') {
      const definition = context.definitions().find((item) => item.id === action.definitionId);
      if (editing || context.provisional() || !definition || !definitionAvailable(definition, page)) return;
      if (action.beforeId && !page.components.some((item) => item.id === action.beforeId && item.type !== 'hero_section')) return;
      context.add(action.beforeId || null, definition);
      return;
    }
    if (action.action === 'cancel-add') { editing = null; context.cancel(); return; }
    if (action.action === 'confirm-add') {
      const provisional = context.provisional();
      const definition = context.definitions().find((item) => item.id === provisional?.definitionId);
      if (!provisional) return;
      const issues = validateComponent(provisional, definition);
      if (issues.length) { context.notice(issues.map((item) => item.message).join(' ')); return; }
      editing = null; context.confirm(); return;
    }
    const provisional = context.provisional();
    const component = provisional?.id === action.componentId ? provisional
      : page.components.find((item) => item.id === action.componentId);
    if (!component || (provisional && provisional.id !== component.id)) return;
    if (action.action.startsWith('text-')) {
      const definition = context.definitions().find((item) => item.id === component.definitionId && item.definitionVersion === component.definitionVersion);
      const field = definition?.fields.find((item) => item.id === action.fieldId && ['text', 'multiline_text'].includes(item.type));
      if (!field) return;
      if (action.action === 'text-begin') {
        if (editing) return;
        context.select(component.id);
        editing = { componentId: component.id, fieldId: field.id, restore: context.beginText() };
        return;
      }
      if (editing?.componentId !== component.id || editing?.fieldId !== field.id) return;
      if (action.action === 'text-change' && typeof action.value === 'string' && action.value.length <= Math.min(field.maxLength || 20000, 20000)) {
        context.select(component.id); context.change(component.id, field.id, action.value);
      } else if (action.action === 'text-cancel') { editing.restore(); editing = null; }
      else if (action.action === 'text-end') { context.endText(); editing = null; }
      return;
    }
    if (editing || provisional) return;
    context.select(component.id);
    if (action.action === 'remove') context.remove(component.id);
    if (action.action === 'move-up' || action.action === 'move-down') {
      const visible = page.components.filter((item) => item.enabled && item.isVisible);
      const index = visible.findIndex((item) => item.id === component.id);
      if (component.type === 'hero_section' || index < 0) return;
      if (action.action === 'move-up' && index > 0 && visible[index - 1].type !== 'hero_section') context.moveTo(component.id, visible[index - 1].id);
      if (action.action === 'move-down' && index < visible.length - 1) context.moveTo(component.id, visible[index + 2]?.id || null);
    }
  };
  return Object.assign(handle, { reset: () => { editing = null; context.endText(); } });
}
