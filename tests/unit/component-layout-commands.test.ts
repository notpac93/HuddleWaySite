import { describe, expect, it } from 'vitest';
import type { CrmComponentStudioPage, CrmPageComponent } from '../../src/lib/api/BackendApi';
import { insertComponent, moveComponentTo } from '../../src/components/crm/app-studio/componentLayoutCommands';

const component = (id: string, type = 'about_section'): CrmPageComponent => ({
  id, type, definitionId: type, definitionVersion: 1, label: id, enabled: true,
  isVisible: true, status: 'draft', content: {}, presetId: null, starterContentReviewKey: null,
});
const page: CrmComponentStudioPage = {
  id: 'home', route: '/', title: 'Home', headline: '', subheader: '', isVisible: true, status: 'published',
  components: [component('hero', 'hero_section'), component('a'), component('b')],
};

describe('stable component layout commands', () => {
  it('inserts at an exact neighbor and retains repeatable instance identities', () => {
    expect(insertComponent(page, component('new'), { beforeId: 'b' })?.map((item) => item.id))
      .toEqual(['hero', 'a', 'new', 'b']);
    expect(page.components.map((item) => item.id)).toEqual(['hero', 'a', 'b']);
    expect(insertComponent(page, component('a'), { beforeId: null })).toBeNull();
  });
  it('rejects vanished locations instead of silently appending', () => {
    expect(insertComponent(page, component('new'), { beforeId: 'deleted' })).toBeNull();
    expect(moveComponentTo(page, 'a', { beforeId: 'deleted' })).toBeNull();
  });
  it('respects the server component limit while still allowing rearrangement at capacity', () => {
    const full = { ...page, components: Array.from({ length: 40 }, (_, index) => component(`section-${index}`)) };
    expect(insertComponent(full, component('overflow'), { beforeId: null })).toBeNull();
    expect(moveComponentTo(full, 'section-0', { beforeId: null })?.at(-1)?.id).toBe('section-0');
  });
  it('pins the hero and prevents inserting or moving body sections ahead of it', () => {
    expect(moveComponentTo(page, 'hero', { beforeId: null })).toBeNull();
    expect(moveComponentTo(page, 'b', { beforeId: 'hero' })).toBeNull();
    expect(insertComponent(page, component('new'), { beforeId: 'hero' })).toBeNull();
    expect(insertComponent(page, component('extra', 'hero_section'), { beforeId: null })).toBeNull();
  });
  it('moves forward, backward, and to the end without changing visibility or content', () => {
    const next = moveComponentTo(page, 'b', { beforeId: 'a' })!;
    expect(next.map((item) => item.id)).toEqual(['hero', 'b', 'a']);
    expect(moveComponentTo({ ...page, components: next }, 'b', { beforeId: null })?.map((item) => item.id))
      .toEqual(['hero', 'a', 'b']);
    expect(next[1]).toBe(page.components[2]);
  });
});
