import { describe, expect, it, vi } from 'vitest';
import { createCanvasEditingSession } from '../../src/components/crm/app-studio/canvasEditingSession';
import { parseCanvasAction } from '../../src/lib/crm/appPreviewProtocol';
import type { CrmComponentDefinition, CrmComponentStudioPage } from '../../src/lib/api/BackendApi';

function setup() {
  const definition: CrmComponentDefinition = { id: 'about', type: 'about_section', definitionVersion: 1, label: 'About', category: 'Home', repeatable: true,
    fields: [{ id: 'title', type: 'text', required: true, maxLength: 40 }], defaultContent: { title: 'Our program' }, presets: [], previewSpec: { title: 'About', description: '', highlights: [] } };
  const page: CrmComponentStudioPage = { id: 'home', title: 'Home', route: '/', headline: '', subheader: '', isVisible: true, status: 'published', components: [{
    id: 'about_1', definitionId: 'about', definitionVersion: 1, type: 'about_section', label: 'About', enabled: true, isVisible: true, status: 'published', content: { title: 'Our program' }, presetId: null, starterContentReviewKey: null,
  }] };
  const restore = vi.fn();
  const context = { enabled: () => true, page: () => page, definitions: () => [definition], provisional: () => null,
    select: vi.fn(), beginText: vi.fn(() => restore), endText: vi.fn(), change: vi.fn(), add: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), remove: vi.fn(), moveTo: vi.fn(), notice: vi.fn(), navigate: vi.fn() };
  return { context, restore, handle: createCanvasEditingSession(context) };
}

describe('canvas editing commands', () => {
  it('uses stable component identities for immediate removal, without relying on UI selection', () => {
    const { handle, context } = setup();
    handle({ action: 'remove', pageId: 'home', componentId: 'about_1' });
    expect(context.remove).toHaveBeenCalledWith('about_1');
    handle({ action: 'remove', pageId: 'other', componentId: 'about_1' });
    handle({ action: 'remove', pageId: 'home', componentId: 'unknown' });
    expect(context.remove).toHaveBeenCalledTimes(1);
  });
  it('groups a text edit and restores the original transaction on cancel', () => {
    const { handle, context, restore } = setup();
    const target = { pageId: 'home', componentId: 'about_1', fieldId: 'title' };
    handle({ ...target, action: 'text-change', value: 'Before begin' });
    expect(context.change).not.toHaveBeenCalled();
    handle({ ...target, action: 'text-begin' });
    handle({ ...target, action: 'text-change', value: 'In-place change' });
    expect(context.change).toHaveBeenCalledWith('about_1', 'title', 'In-place change');
    handle({ ...target, action: 'remove' });
    expect(context.remove).not.toHaveBeenCalled();
    handle({ ...target, action: 'text-cancel' });
    expect(restore).toHaveBeenCalledOnce();
  });
  it('rejects undeclared fields, overlong input, and actions while edit mode is off', () => {
    const { handle, context } = setup();
    handle({ action: 'text-begin', pageId: 'home', componentId: 'about_1', fieldId: '__proto__' });
    expect(context.beginText).not.toHaveBeenCalled();
    handle({ action: 'text-begin', pageId: 'home', componentId: 'about_1', fieldId: 'title' });
    handle({ action: 'text-change', pageId: 'home', componentId: 'about_1', fieldId: 'title', value: 'x'.repeat(41) });
    expect(context.change).not.toHaveBeenCalled();
    context.enabled = () => false;
    handle({ action: 'remove', pageId: 'home', componentId: 'about_1' });
    expect(context.remove).not.toHaveBeenCalled();
  });
  it('validates insertion neighbors and resets an old text transaction between modes', () => {
    const { handle, context } = setup();
    handle({ action: 'add', pageId: 'home', definitionId: 'about', beforeId: 'gone' });
    expect(context.add).not.toHaveBeenCalled();
    handle({ action: 'text-begin', pageId: 'home', componentId: 'about_1', fieldId: 'title' });
    handle.reset();
    handle({ action: 'add', pageId: 'home', definitionId: 'about', beforeId: 'about_1' });
    expect(context.add).toHaveBeenCalledWith('about_1', expect.objectContaining({ id: 'about' }));
  });
  it('rejects malformed messages before interpreting an edit', () => {
    expect(parseCanvasAction({ action: 'execute', pageId: 'home' })).toBeNull();
    expect(parseCanvasAction({ action: 'text-change', pageId: 'home', value: {} })).toBeNull();
    expect(parseCanvasAction({ action: 'text-change', pageId: 'home', value: 'x'.repeat(20001) })).toBeNull();
  });
  it('moves to the next visible section rather than stopping at a hidden neighbor', () => {
    const { handle, context } = setup();
    const page = context.page();
    const first = page.components[0];
    page.components = [first, { ...first, id: 'hidden', isVisible: false }, { ...first, id: 'last' }];
    handle({ action: 'move-down', pageId: 'home', componentId: first.id });
    expect(context.moveTo).toHaveBeenCalledWith(first.id, null);
    handle({ action: 'move-up', pageId: 'home', componentId: 'last' });
    expect(context.moveTo).toHaveBeenLastCalledWith('last', first.id);
  });
});
