import { writable } from 'svelte/store';
export const tenantIdStore = writable('layout-fixture');
export const tenantNamesStore = writable({ 'layout-fixture': 'HuddleWay local preview' });
import content from './content.json';
const { configuration, definitions, pages } = content;
let snapshot = { tenantId: 'layout-fixture', templateId: 'base', templateVersion: 1, versionToken: 'v1', requestId: 'local', definitions, pages };
// All writes are in memory; no network/backend client is available here.
export const backendClient = {
  async appConfiguration() { return { tenantId: 'layout-fixture', mode: 'update', configVersion: 1, versionToken: 'config-v1', configuration }; },
  async appConfigurationHistory() { return { versions: [], truncated: false }; },
  async componentStudio() { return structuredClone(snapshot); },
  async publishPageLayout(_tenant: string, payload: any) {
    snapshot = { ...snapshot, pages: structuredClone(payload.pages), versionToken: String(Number(snapshot.versionToken.replace('v', '')) + 1) };
    return { success: true };
  },
};
export const publicFixturePage = {
  ...snapshot.pages[0], editMode: false,
  editableFields: Object.fromEntries(snapshot.pages[0].components.map((item) => [item.id, definitions.find((definition) => definition.id === item.definitionId)!.fields.filter((field) => ['text', 'multiline_text'].includes(field.type)).map(({ id, label }) => ({ id, label }))])),
};
