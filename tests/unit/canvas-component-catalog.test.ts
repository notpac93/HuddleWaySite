import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { CrmComponentDefinition, CrmComponentStudioPage, CrmPageComponent } from '../../src/lib/api/BackendApi';
import { canvasPageDraft } from '../../src/components/crm/app-studio/canvasPageDraft';
import { createCanvasEditingSession } from '../../src/components/crm/app-studio/canvasEditingSession';
import { createComponent, definitionAvailable, isHeroDefinition } from '../../src/components/crm/app-studio/componentStudioDraft';
import { insertComponent } from '../../src/components/crm/app-studio/componentLayoutCommands';
const require = createRequire(import.meta.url);
const definitions: CrmComponentDefinition[] = require('../../../backend/lib/crm_component_definition_catalog.js').cloneBuiltInDefinitions();
const bodyDefinitions = definitions.filter(item => !isHeroDefinition(item));
function emptyPage(): CrmComponentStudioPage {
  return { id: 'home', title: 'Home', route: '/', headline: '', subheader: '', isVisible: true, status: 'published', components: [] };
}

describe('complete canvas component catalog', () => {
  it.each(bodyDefinitions)('offers, previews, and confirms $label using its canonical defaults', (definition) => {
    const page = emptyPage();
    const hero = createComponent(definitions.find(isHeroDefinition)!, page);
    page.components = [hero];
    let provisional: CrmPageComponent | null = null;
    const notice = vi.fn();
    const handle = createCanvasEditingSession({
      enabled: () => true, page: () => page, definitions: () => definitions, provisional: () => provisional,
      select: vi.fn(), beginText: () => vi.fn(), endText: vi.fn(), change: vi.fn(), cancel: vi.fn(), remove: vi.fn(), moveTo: vi.fn(), navigate: vi.fn(), notice,
      add: (_beforeId, chosen) => { provisional = createComponent(chosen, page); },
      confirm: () => { page.components = insertComponent(page, provisional!, { beforeId: null })!; provisional = null; },
    });
    expect(canvasPageDraft(page, page.components, definitions, true, null, 'edit').availableComponents!.map(item => item.id)).toContain(definition.id);
    handle({ action: 'add', pageId: page.id, definitionId: definition.id });
    expect(provisional).toMatchObject({ definitionId: definition.id, type: definition.type });
    handle({ action: 'confirm-add', pageId: page.id });
    expect(notice).not.toHaveBeenCalled();
    expect(provisional).toBeNull();
    expect(page.components.map(item => item.definitionId)).toEqual([hero.definitionId, definition.id]);
    if (!definition.repeatable) expect(definitionAvailable(definition, page)).toBe(false);
  });
  it('excludes all hero aliases even on a page without a hero and rejects direct add commands', () => {
    const page = emptyPage();
    const heroes = ['hero_section', 'hero', 'home_hero'].map((type, index) => ({ ...definitions.find(isHeroDefinition)!, id: `hero-${index}`, type }));
    const add = vi.fn();
    const handle = createCanvasEditingSession({ enabled: () => true, page: () => page, definitions: () => heroes, provisional: () => null, select: vi.fn(), beginText: () => vi.fn(), endText: vi.fn(), change: vi.fn(), add, confirm: vi.fn(), cancel: vi.fn(), remove: vi.fn(), moveTo: vi.fn(), notice: vi.fn(), navigate: vi.fn() });
    expect(canvasPageDraft(page, [], heroes, true, null, 'edit').availableComponents).toEqual([]);
    for (const hero of heroes) handle({ action: 'add', pageId: page.id, definitionId: hero.id });
    expect(add).not.toHaveBeenCalled();
  });
  it('retains the page component limit for every non-hero definition', () => {
    const page = emptyPage();
    page.components = Array.from({ length: 40 }, () => createComponent(bodyDefinitions[0], page));
    expect(canvasPageDraft(page, page.components, definitions, true, null, 'edit').availableComponents).toEqual([]);
  });
});
