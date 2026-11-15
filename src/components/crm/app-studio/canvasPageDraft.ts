import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../../lib/api/BackendApi';
import type { AppPagePreviewDraft } from '../../../lib/crm/appPreviewProtocol';
import { definitionAvailable } from './componentStudioDraft';

export function canvasPageDraft(page: CrmComponentStudioPage, components: CrmPageComponent[], definitions: CrmComponentDefinition[], editMode: boolean, provisionalId: string | null, editSessionId: string): AppPagePreviewDraft {
  return {
    id: page.id, route: page.route, title: page.title, components, editMode, provisionalId, editSessionId,
    editableFields: Object.fromEntries(components.map((item) => [item.id,
      (definitions.find((definition) => definition.id === item.definitionId && definition.definitionVersion === item.definitionVersion)?.fields || [])
        .filter((field) => ['text', 'multiline_text'].includes(field.type))
        .map((field) => ({ id: field.id, label: field.label || field.id, maxLength: Math.min(field.maxLength || 20000, 20000) })),
    ])),
    availableComponents: definitions.filter((definition) => definitionAvailable(definition, page)).map(({ id, label }) => ({ id, label })),
  };
}
